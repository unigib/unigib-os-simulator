(function (root) {
  "use strict";

  function createFileSystem() {
    const directory = () => ({ type: "directory", entries: new Map() });
    const rootDirectory = directory();
    const home = directory();
    const student = directory();
    rootDirectory.entries.set("home", home);
    home.entries.set("student", student);
    let cwd = ["home", "student"];

    function resolve(path) {
      if (typeof path !== "string" || !path) throw new Error("A path is required.");
      const names = path.startsWith("/") ? [] : cwd.slice();
      const nodes = [rootDirectory];
      for (const name of names) nodes.push(nodes[nodes.length - 1].entries.get(name));
      for (const part of path.split("/").filter(Boolean)) {
        const current = nodes[nodes.length - 1];
        if (current.type !== "directory") throw new Error(`Not a directory: ${path}`);
        if (part === ".") continue;
        if (part === "..") {
          if (names.length) { names.pop(); nodes.pop(); }
          continue;
        }
        const next = current.entries.get(part);
        if (!next) throw new Error(`No such file or directory: ${path}`);
        names.push(part);
        nodes.push(next);
      }
      const node = nodes[nodes.length - 1];
      if (path.endsWith("/") && node.type !== "directory") throw new Error(`Not a directory: ${path}`);
      return { node, names };
    }

    function requireDirectory(path) {
      const result = resolve(path);
      if (result.node.type !== "directory") throw new Error(`Not a directory: ${path}`);
      return result;
    }

    function mkdir(path) {
      if (typeof path !== "string" || !path || /^\/+$/.test(path)) throw new Error("A new directory path is required.");
      const trimmed = path.replace(/\/+$/, "");
      const slash = trimmed.lastIndexOf("/");
      const name = trimmed.slice(slash + 1);
      const parentPath = slash < 0 ? "." : (trimmed.slice(0, slash) || "/");
      if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") throw new Error("Directory names may contain letters, numbers, '.', '_' and '-'.");
      const parent = requireDirectory(parentPath).node;
      if (parent.entries.has(name)) throw new Error(`Already exists: ${path}`);
      parent.entries.set(name, directory());
    }

    function cd(path) {
      cwd = requireDirectory(path || "/home/student").names;
    }

    function pwd() {
      return "/" + cwd.join("/");
    }

    function list(path) {
      const node = requireDirectory(path || ".").node;
      return Array.from(node.entries, ([name, entry]) => name + (entry.type === "directory" ? "/" : "")).sort();
    }

    function read(path) {
      const node = resolve(path).node;
      if (node.type !== "file") throw new Error(`Not a file: ${path}`);
      return node.content;
    }

    function writeFiles(files) {
      const parent = requireDirectory(".").node;
      for (const [name, content] of Object.entries(files)) {
        if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === ".." || typeof content !== "string") throw new Error(`Invalid file: ${name}`);
        const existing = parent.entries.get(name);
        if (existing && existing.type !== "file") throw new Error(`Cannot overwrite a directory: ${name}`);
      }
      for (const [name, content] of Object.entries(files)) parent.entries.set(name, { type: "file", content });
    }

    return { mkdir, cd, pwd, list, read, writeFiles };
  }

  function compileProgram(functions) {
    const opcodes = { malloc: 0x10, free: 0x11, declare: 0x12, call: 0x13, return: 0x14, "loop-enter": 0x15, "loop-repeat": 0x16 };
    const sizes = { malloc: 11, free: 3, declare: 11, call: 5, return: 1, "loop-enter": 1, "loop-repeat": 5 };
    const labels = Object.create(null);
    const offsets = Object.create(null);
    const rows = [];
    let offset = 0;
    for (const fn of Object.values(functions)) {
      labels[fn.name] = offset;
      const scopes = [new Map()];
      let nextSlot = 0;
      offsets[fn.name] = [];
      const instructions = fn.instructions.slice();
      if (!instructions.length || instructions[instructions.length - 1].type !== "return") instructions.push({ type: "return", implicit: true });
      for (const instruction of instructions) {
        offsets[fn.name].push(offset);
        if (instruction.type === "loop-enter") scopes.push(new Map());
        let slot;
        if (instruction.variable !== undefined) {
          let scope = scopes[scopes.length - 1];
          if (instruction.type === "free") {
            scope = scopes.slice().reverse().find(item => item.has(instruction.variable)) || scope;
          }
          if (!scope.has(instruction.variable)) scope.set(instruction.variable, nextSlot++);
          slot = scope.get(instruction.variable);
          if (slot > 0xFFFF) throw new Error(`Function ${fn.name} has too many local variables.`);
        }
        rows.push({ fn: fn.name, offset, instruction, slot });
        if (instruction.type === "loop-repeat") scopes.pop();
        offset += sizes[instruction.type];
        if (offset > 0xFFFFFFFF) throw new Error("Program is too large for the teaching instruction set.");
      }
    }

    function littleEndian(value, count) {
      let n = BigInt.asUintN(count * 8, BigInt(value));
      const bytes = [];
      for (let i = 0; i < count; i++) { bytes.push(Number(n & 255n)); n >>= 8n; }
      return bytes;
    }
    function hexAddress(value) { return `$${value.toString(16).toUpperCase().padStart(8, "0")}`; }
    const assembly = ["; OS Lab teaching instruction set (not native machine code)", `; Entry point: main at ${hexAddress(labels.main)}`, "; Integers and addresses are little-endian; slots are local to each call.", ""];
    const machine = [`; OS Lab teaching machine code, entry ${hexAddress(labels.main)}`, "; Each line is a byte offset followed by hexadecimal bytes.", ""];
    let lastFunction = "";
    for (const row of rows) {
      const instruction = row.instruction;
      const bytes = [opcodes[instruction.type]];
      let text;
      if (instruction.type === "malloc") {
        bytes.push(...littleEndian(row.slot, 2), ...littleEndian(instruction.size, 8));
        text = `ALLOC slot${row.slot}, ${instruction.size}  ; ${instruction.variable}`;
      } else if (instruction.type === "free") {
        bytes.push(...littleEndian(row.slot, 2));
        text = `FREE  slot${row.slot}  ; ${instruction.variable}`;
      } else if (instruction.type === "declare") {
        const value = BigInt(instruction.value);
        if (value < -(1n << 63n) || value >= (1n << 63n)) throw new Error(`Line ${instruction.line}: integer is outside the teaching ISA's signed 64-bit range.`);
        bytes.push(...littleEndian(row.slot, 2), ...littleEndian(value, 8));
        text = `SET   slot${row.slot}, ${instruction.value}  ; ${instruction.variable}`;
      } else if (instruction.type === "call") {
        bytes.push(...littleEndian(labels[instruction.name], 4));
        text = `CALL  ${instruction.name}  ; ${hexAddress(labels[instruction.name])}`;
      } else if (instruction.type === "loop-enter") {
        text = "SCOPE ; enter loop block";
      } else if (instruction.type === "loop-repeat") {
        const target = offsets[row.fn][instruction.target];
        bytes.push(...littleEndian(target, 4));
        text = `REPEAT ${hexAddress(target)}  ; leave block and loop`;
      } else {
        text = instruction.implicit ? "RET   ; implicit return" : "RET";
      }
      const encoded = bytes.map(byte => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      if (row.fn !== lastFunction) {
        assembly.push(`${row.fn}:`);
        lastFunction = row.fn;
      }
      assembly.push(`  ${hexAddress(row.offset)}  ${text}`);
      machine.push(`${hexAddress(row.offset)}: ${encoded}`);
    }
    return { assembly: assembly.join("\n") + "\n", machine: machine.join("\n") + "\n" };
  }

  const api = { createFileSystem, compileProgram };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OSLabTeaching = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
