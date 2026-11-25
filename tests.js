"use strict";
const assert = require("node:assert/strict");
const sim = require("./simulator.js");
const teaching = require("./teaching.js");

{
  assert.equal(sim.formatAddress(0, 4), "$0000");
  assert.equal(sim.formatAddress(sim.VIRTUAL_MEMORY_SIZE - 1, 4), "$03FF");
  assert.equal(sim.physicalRange({ start: 0, size: 128 }), "$00000000–$07FFFFFF");
  assert.equal(sim.physicalRange({ start: 128, size: 64 }), "$08000000–$0BFFFFFF");
  assert.equal(sim.physicalRange({ start: 624, size: 400 }), "$27000000–$3FFFFFFF");
}

{
  const machine = sim.createMachine();
  const editor = sim.launch(machine, "editor");
  const browser = sim.launch(machine, "browser");
  assert.equal(editor.start, 224);
  assert.equal(browser.start, 384);
  sim.stop(machine, editor.pid);
  const music = sim.launch(machine, "music");
  assert.equal(music.start, 224);
  assert.deepEqual(sim.regions(machine).map(r => [r.start, r.size]), [[0, 128], [128, 64], [192, 32], [224, 120], [344, 40], [384, 240], [624, 400]]);
  assert.throws(() => sim.launch(machine, "unknown"), /Unknown app/);
  assert.throws(() => sim.stop(machine, 999), /No process/);
}

{
  const machine = sim.createMachine();
  const processes = Array.from({ length: 5 }, () => sim.launch(machine, "editor"));
  sim.stop(machine, processes[1].pid);
  sim.stop(machine, processes[3].pid);
  assert.throws(() => sim.launch(machine, "browser"), /contiguous memory/);
}

{
  const machine = sim.createMachine();
  const process = sim.launch(machine, "lab", sim.parseProgram(sim.EXAMPLE));
  sim.step(process);
  assert.equal(process.program.allocations[0].size, 64);
  sim.step(process);
  assert.deepEqual(process.program.frames.map(frame => frame.name), ["main", "draw"]);
  sim.step(process);
  assert.deepEqual(process.program.allocations.map(item => item.size), [64, 32]);
  sim.step(process);
  sim.step(process);
  assert.deepEqual(process.program.frames.map(frame => frame.name), ["main"]);
  sim.step(process);
  sim.step(process);
  assert.equal(process.state, "completed");
  assert.equal(process.program.allocations.length, 0);
  assert.throws(() => sim.step(process), /No running/);
}

{
  assert.throws(() => sim.parseProgram("int main() {\nunknown();\n}"), /unknown function/);
  assert.throws(() => sim.parseProgram("int main() {\nwhile (1) {}\n}"), /unsupported statement/);
  assert.throws(() => sim.parseProgram("int main() {\nint *x = malloc(0);\n}"), /positive/);
  const source = "int main() {\nint *constructor = malloc(32);\nfree(constructor);\nfree(constructor);\n}";
  const process = sim.launch(sim.createMachine(), "lab", sim.parseProgram(source));
  sim.step(process);
  sim.step(process);
  assert.throws(() => sim.step(process), /already been freed/);
}

{
  const source = "int main() {\nint *a = malloc(600);\nhelper();\n}\nvoid helper() {\nreturn;\n}";
  const process = sim.launch(sim.createMachine(), "lab", sim.parseProgram(source));
  sim.step(process);
  assert.throws(() => sim.step(process), /stack collided/);
  assert.equal(process.program.frames.length, 1);
}

{
  const fs = teaching.createFileSystem();
  assert.equal(fs.pwd(), "/home/student");
  fs.mkdir("projects");
  fs.cd("projects");
  fs.mkdir("nested");
  fs.writeFiles({ "program.c": "source", "program.asm": "assembly" });
  assert.deepEqual(fs.list("."), ["nested/", "program.asm", "program.c"]);
  assert.equal(fs.read("../projects/program.c"), "source");
  assert.throws(() => fs.cd("program.c"), /Not a directory/);
  assert.equal(fs.pwd(), "/home/student/projects");
  assert.throws(() => fs.mkdir("missing/child"), /No such file/);
  assert.throws(() => fs.read("nested"), /Not a file/);
  assert.throws(() => fs.read("program.c/.."), /Not a directory/);
  assert.throws(() => fs.writeFiles({ "program.c": "changed", nested: "bad" }), /Cannot overwrite a directory/);
  assert.equal(fs.read("program.c"), "source");
  fs.cd("/../../home/student/projects/./nested/..");
  assert.equal(fs.pwd(), "/home/student/projects");
  fs.cd();
  assert.equal(fs.pwd(), "/home/student");
  assert.deepEqual(teaching.createFileSystem().list(), []);
}

{
  const compiled = teaching.compileProgram(sim.parseProgram(sim.EXAMPLE));
  assert.match(compiled.assembly, /Entry point: main at \$0000000F/);
  assert.match(compiled.assembly, /\$0000001A  CALL  draw  ; \$00000000/);
  assert.equal(compiled.machine, [
    "; OS Lab teaching machine code, entry $0000000F",
    "; Each line is a byte offset followed by hexadecimal bytes.",
    "",
    "$00000000: 10 00 00 20 00 00 00 00 00 00 00",
    "$0000000B: 11 00 00",
    "$0000000E: 14",
    "$0000000F: 10 00 00 40 00 00 00 00 00 00 00",
    "$0000001A: 13 00 00 00 00",
    "$0000001F: 11 00 00",
    "$00000022: 14",
    ""
  ].join("\n"));
  const signed = teaching.compileProgram(sim.parseProgram("int main() {\nint n = -2;\n}"));
  assert.match(signed.machine, /\$00000000: 12 00 00 FE FF FF FF FF FF FF FF/);
  assert.match(signed.assembly, /RET   ; implicit return/);
  assert.throws(() => teaching.compileProgram(sim.parseProgram("int main() {\nint n = 9223372036854775808;\n}")), /signed 64-bit range/);
}

console.log("All simulator tests passed.");
