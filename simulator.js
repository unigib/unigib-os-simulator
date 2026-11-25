(function (root) {
  "use strict";

  const TOTAL_MEMORY = 1024;
  const VIRTUAL_MEMORY_SIZE = 1024;
  const HEAP_START = 320;
  const STACK_FRAME_SIZE = 64;
  const BYTES_PER_MB = 1024 * 1024;
  function formatAddress(address, digits) {
    return `$${address.toString(16).toUpperCase().padStart(digits, "0")}`;
  }
  function physicalRange(region) {
    return `${formatAddress(region.start * BYTES_PER_MB, 8)}–${formatAddress((region.start + region.size) * BYTES_PER_MB - 1, 8)}`;
  }
  const SYSTEM_REGIONS = [
    { start: 0, size: 128, name: "Operating system", type: "kernel", detail: "Kernel & core services" },
    { start: 128, size: 64, name: "Video memory", type: "device", detail: "Display buffer" },
    { start: 192, size: 32, name: "Device I/O", type: "device", detail: "Memory-mapped devices" }
  ];
  const APPS = {
    editor: { name: "Notes", size: 160, icon: "▤", color: "lavender", description: "A simple text editor" },
    browser: { name: "Web browser", size: 240, icon: "◉", color: "cyan", description: "A window to the web" },
    music: { name: "Music player", size: 120, icon: "♫", color: "coral", description: "A little background music" },
    lab: { name: "C program", size: 192, icon: "⌘", color: "mint", description: "Your playground program" }
  };
  const EXAMPLE = `#include <stdlib.h>

void draw_details() {
  int *pixels = malloc(32);
  free(pixels);
  return;
}

void render() {
  int *image = malloc(48);
  draw_details();
  free(image);
  return;
}

int main() {
  while (1) {
    int *buffer = malloc(64);
    render();
    free(buffer);
  }
}`;

  function parseProgram(source) {
    const functions = Object.create(null);
    let current = null;
    let loops = [];
    for (const [index, raw] of source.split(/\r?\n/).entries()) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      const lineNumber = index + 1;
      if (!line || /^#include\s+<stdlib\.h>$/.test(line)) continue;
      if (!current) {
        const declaration = line.match(/^(?:int|void)\s+([A-Za-z_]\w*)\s*\(\s*(?:void)?\s*\)\s*\{$/);
        if (!declaration) throw new Error(`Line ${lineNumber}: expected a no-argument function declaration.`);
        if (functions[declaration[1]]) throw new Error(`Line ${lineNumber}: duplicate function ${declaration[1]}.`);
        current = { name: declaration[1], instructions: [] };
        functions[current.name] = current;
        loops = [];
        continue;
      }
      if (line === "}") {
        if (loops.length) {
          const target = loops.pop();
          current.instructions.push({ type: "loop-repeat", target, line: lineNumber });
        } else {
          current = null;
        }
        continue;
      }
      if (/^while\s*\(\s*1\s*\)\s*\{$/.test(line)) {
        loops.push(current.instructions.length);
        current.instructions.push({ type: "loop-enter", line: lineNumber });
        continue;
      }
      let match;
      let instruction;
      if ((match = line.match(/^(?:int|char|void)\s*\*\s*([A-Za-z_]\w*)\s*=\s*malloc\s*\(\s*(\d+)\s*\)\s*;$/))) {
        instruction = { type: "malloc", variable: match[1], size: Number(match[2]) };
        if (!Number.isSafeInteger(instruction.size) || instruction.size <= 0) throw new Error(`Line ${lineNumber}: malloc size must be a positive safe integer.`);
      } else if ((match = line.match(/^free\s*\(\s*([A-Za-z_]\w*)\s*\)\s*;$/))) {
        instruction = { type: "free", variable: match[1] };
      } else if ((match = line.match(/^int\s+([A-Za-z_]\w*)\s*(?:=\s*(-?\d+))?\s*;$/))) {
        instruction = { type: "declare", variable: match[1], value: match[2] || "0" };
      } else if ((match = line.match(/^return(?:\s+-?\d+)?\s*;$/))) {
        instruction = { type: "return" };
      } else if ((match = line.match(/^([A-Za-z_]\w*)\s*\(\s*\)\s*;$/))) {
        instruction = { type: "call", name: match[1] };
      } else {
        throw new Error(`Line ${lineNumber}: unsupported statement. See the language guide.`);
      }
      instruction.line = lineNumber;
      current.instructions.push(instruction);
    }
    if (current) throw new Error(`${loops.length ? "Loop in function" : "Function"} ${current.name} is missing a closing brace.`);
    if (!functions.main) throw new Error("Program must define main().");
    for (const fn of Object.values(functions)) {
      for (const instruction of fn.instructions) {
        if (instruction.type === "call" && !functions[instruction.name]) {
          throw new Error(`Line ${instruction.line}: unknown function ${instruction.name}().`);
        }
      }
    }
    return functions;
  }

  function createMachine() {
    return { processes: [], nextPid: 101, selectedPid: null, programPid: null };
  }

  function regions(machine) {
    const occupied = SYSTEM_REGIONS.concat(machine.processes.map(p => ({
      start: p.start, size: p.size, name: p.name, type: "process", pid: p.pid, color: p.color
    }))).sort((a, b) => a.start - b.start);
    const result = [];
    let cursor = 0;
    for (const region of occupied) {
      if (region.start > cursor) result.push({ start: cursor, size: region.start - cursor, name: "Available memory", type: "free" });
      result.push(region);
      cursor = region.start + region.size;
    }
    if (cursor < TOTAL_MEMORY) result.push({ start: cursor, size: TOTAL_MEMORY - cursor, name: "Available memory", type: "free" });
    return result;
  }

  function launch(machine, key, program) {
    const app = APPS[key];
    if (!app) throw new Error(`Unknown app: ${key}.`);
    const available = regions(machine).find(region => region.type === "free" && region.size >= app.size);
    if (!available) throw new Error(`Not enough contiguous memory to launch ${app.name} (${app.size} MB needed).`);
    const process = { ...app, key, pid: machine.nextPid++, start: available.start, state: "running", program: null };
    if (key === "lab" && program) {
      process.program = { functions: program, frames: [createFrame("main")], allocations: [], message: "Ready to execute main()." };
      machine.programPid = process.pid;
    }
    machine.processes.push(process);
    machine.selectedPid = process.pid;
    return process;
  }

  function stop(machine, pid) {
    const index = machine.processes.findIndex(process => process.pid === pid);
    if (index < 0) throw new Error(`No process with PID ${pid}.`);
    const [process] = machine.processes.splice(index, 1);
    if (machine.programPid === pid) machine.programPid = null;
    if (machine.selectedPid === pid) machine.selectedPid = machine.processes.length ? machine.processes[0].pid : null;
    return process;
  }

  function createFrame(name) {
    return { name, pc: 0, variables: Object.create(null), scopes: [] };
  }

  function step(process) {
    const program = process.program;
    if (!program || process.state !== "running") throw new Error("No running C program to step.");
    const frame = program.frames[program.frames.length - 1];
    const fn = program.functions[frame.name];
    const instruction = fn.instructions[frame.pc];
    if (!instruction) {
      program.frames.pop();
      program.message = `Returned from ${frame.name}().`;
    } else {
      const prefix = `Line ${instruction.line}: `;
      const currentScope = frame.scopes.length ? frame.scopes[frame.scopes.length - 1] : frame.variables;
      if (instruction.type === "malloc") {
        if (Object.prototype.hasOwnProperty.call(currentScope, instruction.variable)) throw new Error(`${prefix}${instruction.variable} is already declared in this scope.`);
        const stackBottom = VIRTUAL_MEMORY_SIZE - program.frames.length * STACK_FRAME_SIZE;
        const allocations = program.allocations.slice().sort((a, b) => a.start - b.start);
        let address = HEAP_START;
        for (const allocation of allocations) {
          if (allocation.start - address >= instruction.size) break;
          address = allocation.start + allocation.size;
        }
        if (address + instruction.size > stackBottom) throw new Error(`${prefix}out of simulated heap space.`);
        const allocation = { start: address, size: instruction.size, name: instruction.variable };
        program.allocations.push(allocation);
        currentScope[instruction.variable] = { kind: "pointer", allocation };
        program.message = `${instruction.variable} = malloc(${instruction.size}): allocated ${instruction.size} bytes on the heap.`;
      } else if (instruction.type === "free") {
        const scopes = [frame.variables, ...frame.scopes];
        const scope = scopes.reverse().find(item => Object.prototype.hasOwnProperty.call(item, instruction.variable));
        const variable = scope && scope[instruction.variable];
        if (!variable || variable.kind !== "pointer") throw new Error(`${prefix}${instruction.variable} is not a pointer in this frame.`);
        const index = program.allocations.indexOf(variable.allocation);
        if (index < 0) throw new Error(`${prefix}${instruction.variable} has already been freed.`);
        program.allocations.splice(index, 1);
        program.message = `free(${instruction.variable}): released ${variable.allocation.size} heap bytes.`;
      } else if (instruction.type === "declare") {
        if (Object.prototype.hasOwnProperty.call(currentScope, instruction.variable)) throw new Error(`${prefix}${instruction.variable} is already declared in this scope.`);
        currentScope[instruction.variable] = { kind: "int", value: instruction.value };
        program.message = `Declared ${instruction.variable} = ${instruction.value} in ${frame.name}()'s stack frame.`;
      } else if (instruction.type === "call") {
        const stackBottom = VIRTUAL_MEMORY_SIZE - (program.frames.length + 1) * STACK_FRAME_SIZE;
        if (program.allocations.some(allocation => allocation.start + allocation.size > stackBottom)) throw new Error(`${prefix}stack collided with the heap.`);
        if (stackBottom < HEAP_START) throw new Error(`${prefix}out of simulated stack space.`);
        program.frames.push(createFrame(instruction.name));
        program.message = `Called ${instruction.name}(): added a stack frame.`;
      } else if (instruction.type === "return") {
        program.frames.pop();
        program.message = `Returned from ${frame.name}(): removed its stack frame.`;
      } else if (instruction.type === "loop-enter") {
        frame.scopes.push(Object.create(null));
        program.message = "Entered while (1): started a new block scope.";
      } else if (instruction.type === "loop-repeat") {
        frame.scopes.pop();
        program.message = "Repeating while (1): block locals leave scope.";
      }
      frame.pc = instruction.type === "loop-repeat" ? instruction.target : frame.pc + 1;
    }
    if (!program.frames.length) {
      process.state = "completed";
      program.message += " Program finished; its process remains in memory until stopped.";
    }
    return program.message;
  }

  const api = { TOTAL_MEMORY, VIRTUAL_MEMORY_SIZE, HEAP_START, STACK_FRAME_SIZE, BYTES_PER_MB, formatAddress, physicalRange, SYSTEM_REGIONS, APPS, EXAMPLE, parseProgram, createMachine, regions, launch, stop, step };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OSLab = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
