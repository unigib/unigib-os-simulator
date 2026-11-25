# OS Lab

A browser-based teaching simulator for exploring processes and memory. Open `index.html` in a modern browser; no installation or server is required. Everything runs locally and resets when the page is refreshed.

## Explore

- The physical memory map shows a simplified 1,024 MB address space, with the operating system at the bottom, reserved video and device I/O regions, processes, and free space. Select a process in the map or process list to inspect it.
- Addresses use `$`-prefixed hexadecimal byte addresses. The physical map spans `$00000000`–`$3FFFFFFF` (1,024 × 1,024 × 1,024 bytes); region ranges are inclusive. The terminal's `mem` command uses the same ranges.
- Launch apps to allocate contiguous physical memory using first fit. Stop them to release it. Allocation can fail when no single free region is large enough, even if the total free space would be sufficient.
- The process anatomy is a schematic virtual address space, not a scale drawing. Ordinary apps use illustrative stack and heap content; the C program shows the simulation's actual frames and allocations.
- Use the terminal's `help`, `pwd`, `ls [path]`, `cd [path]`, `mkdir <path>`, `cat <file>`, `compile`, `ps`, `mem`, `run <editor|browser|music|lab>`, `kill <pid>`, and `clear` commands. `run lab` loads and starts the current playground source at the selected playback delay. Use `ps` to find its PID, then `kill <pid>` to stop it and release its simulated memory. The terminal keeps the latest 300 output entries.
- In the C playground, edit the example, load it, then use **Step** or **Run slowly** to execute one statement at a time. The example uses `while (1)` to repeat until stopped with `kill <pid>` or the process stop button. The adjustable delay controls playback; **Pause** pauses it without killing the process. The live memory view shows each stack frame, local variable and active heap allocation as calls, `malloc`, `free`, and returns execute. The next source line is shown from the loaded snapshot: edits require loading again. Playback stops on completion, runtime error, or when that process is stopped or another program is loaded. Each load creates a new process; stop it to reclaim its physical memory. The controls operate on the most recently loaded C program. Completed processes remain resident until stopped.

## From simulation to real C

[real_world_lab.c](real_world_lab.c) is a real C program corresponding to the playground example. It repeatedly allocates a 64-byte buffer in `main`, calls `render` (48 bytes), which calls `draw_details` (32 bytes), then frees each allocation in reverse order. It prints its PID, local-variable addresses, heap pointers, calls, and frees with pauses so students can follow along. Edit the size and delay constants at the top to experiment.

On Linux or macOS, with a C compiler installed, run in a terminal in this folder:

```sh
gcc -std=c11 -O0 -g -Wall -Wextra -Wpedantic real_world_lab.c -o real_world_lab
./real_world_lab
```

On Windows, with GCC installed, use PowerShell in this folder:

```powershell
gcc -std=c11 -O0 -g -Wall -Wextra -Wpedantic real_world_lab.c -o real_world_lab.exe
.\real_world_lab.exe
```

Alternatively, in a Visual Studio Developer Command Prompt:

```text
cl /nologo /W4 /Od /Zi /std:c11 real_world_lab.c /Fe:real_world_lab.exe
real_world_lab.exe
```

The program runs until stopped; press **Ctrl+C** or use a second terminal. For example, if it prints PID `1234`, first verify that PID belongs to this program, then use `kill 1234` on Linux/macOS or `Stop-Process -Id 1234` in Windows PowerShell. Use the actual displayed PID, not `1234`. Run with `--once` to complete one iteration normally.

These are real virtual addresses in the process, not the simulator's `$0000`–`$03FF` teaching model. The printed local-variable addresses illustrate stack usage on typical systems, but C does not guarantee a particular stack layout, direction, or address. Heap addresses and reuse also vary; `%p` formatting is implementation-dependent. The real program uses operating-system APIs for its PID and delays and is intentionally outside the simulator's small C subset. Its output is native to the compiler and platform, not the fictional teaching instruction set.

## Simulated filesystem

The terminal starts in `/home/student`. Paths may be absolute or relative and support `.` and `..`; `cd` without a path returns home. `mkdir` creates one directory at a time, `ls` lists a directory, and `cat` displays a file. Names use letters, numbers, `.`, `_`, and `-`; spaces and shell quoting are not supported. The filesystem is simulated in memory, does not access the computer's files, and resets on refresh.

Click **Compile to files** or enter `compile` to translate the current editor contents into `program.asm` and `program.hex`, and save the source as `program.c`, in the terminal's current directory. Existing files of those names are replaced; directories are never overwritten. Compilation errors do not modify the files. Use `ls` and `cat program.asm` or `cat program.hex` to inspect them. The playground also displays both outputs.

## C teaching subset

This is a small C-like teaching subset, not a complete C compiler, and does not execute native code. The interpreter runs the parsed source, independently of the generated teaching files. Put each declaration, statement, opening function brace, and closing brace on its own line. The supported syntax is:

```c
#include <stdlib.h>

void helper() {
  int *data = malloc(32);
  free(data);
  return;
}

int main() {
  int count = 1;
  helper();
  return 0;
}
```

Functions must be `int` or `void` with no arguments (`()` or `(void)`). Statements may be a no-argument function call, `int` declaration with an optional integer literal, pointer declaration initialized by `malloc` with a positive integer byte count, `free` of a pointer declared in the current function frame, or `return` with an optional integer literal. A `while (1) {` block repeats indefinitely unless its function returns or the process is killed; the closing `}` must be on its own line. Block locals are recreated each iteration and may shadow outer locals; leaving a block does not automatically free heap allocations. `break`, other loop conditions, and other control flow are not supported. Return values are ignored. `//` comments are supported. Arguments, expressions, assignment, pointer arithmetic, and other C constructs are not supported. Invalid input and allocation errors are reported rather than silently executed.

The C process has a separate, deliberately tiny 1,024-byte *virtual* teaching model, spanning `$0000`–`$03FF`: code and data occupy bytes 0–319, the heap starts at byte 320, and each stack frame occupies 64 bytes growing down from byte 1,024. The same address range is used illustratively for the other apps' schematic diagrams. Allocations use first fit and cannot collide with the stack. These bytes are illustrative and are not directly converted to the process's physical MB reservation. Memory-mapped devices, physical placement, and isolation are simplified models, not a representation of a real machine's complete address translation.

## Teaching instruction set

Compilation translates the supported statements to a **fictional** instruction set, not x86, ARM, or another real CPU. The assembly file shows instruction byte offsets, labels and operands; the `.hex` file is a text representation of the corresponding bytes, not a native executable. Both identify the `main` entry offset. Offsets refer to this generated instruction stream, not the physical or process memory-map addresses. Each function has its own numbered local slots; a call creates a new frame. Source return values are ignored, and a function that reaches its end has an implicit `RET`.

All multibyte operands are little-endian:

| Opcode | Assembly | Bytes after opcode | Meaning |
| --- | --- | --- | --- |
| `10` | `ALLOC slot, size` | 2-byte slot, 8-byte unsigned size | Allocate heap bytes and store a pointer in the local slot. |
| `11` | `FREE slot` | 2-byte slot | Free the allocation referenced by the local slot. |
| `12` | `SET slot, value` | 2-byte slot, 8-byte signed two's-complement value | Declare an integer local. |
| `13` | `CALL label` | 4-byte unsigned instruction offset | Call a function with a new stack frame. |
| `14` | `RET` | none | Return and remove the current frame. |
| `15` | `SCOPE` | none | Enter a new block scope. |
| `16` | `REPEAT offset` | 4-byte unsigned instruction offset | Leave the current block scope and jump to the loop's `SCOPE`. |

For example, `ALLOC slot0, 32` is `10 00 00 20 00 00 00 00 00 00 00`: opcode `10`, slot `00 00`, then the eight-byte size. Compilation rejects integer literals outside the signed 64-bit range. The files illustrate an encoding only: there is no CPU emulator for this instruction set, and stepping continues to use the source interpreter and its runtime checks.

## Tests

Run `node tests.js` to exercise allocation, process lifecycle, parsing, stepping, filesystem operations, and teaching-code generation. Node is only needed for tests, not to use the app.
