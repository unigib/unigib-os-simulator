(function () {
  "use strict";
  const sim = window.OSLab;
  const teaching = window.OSLabTeaching;
  const machine = sim.createMachine();
  const fs = teaching.createFileSystem();
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const output = $("terminal-output");
  let codeMessage = "Load the example to get started.";

  function log(message, className) {
    const line = document.createElement("div");
    if (className) line.className = className;
    line.textContent = message;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  function processById(pid) {
    return machine.processes.find(process => process.pid === pid);
  }

  function renderMemory() {
    const blocks = sim.regions(machine).slice().reverse();
    $("memory-map").innerHTML = blocks.map(region => {
      const selected = region.pid === machine.selectedPid;
      const detail = region.type === "process" ? `PID ${region.pid} · ${region.size} MB` : region.type === "free" ? `${region.size} MB available` : region.detail;
      const tag = region.type === "kernel" ? "PROTECTED" : region.type === "device" ? "RESERVED" : region.type === "free" ? "FREE" : "PROCESS";
      const content = `<span class="memory-block-icon">${region.type === "kernel" ? "✳" : region.type === "device" ? "▧" : region.type === "free" ? "＋" : "◈"}</span><span class="memory-block-text"><strong>${escapeHtml(region.name)}</strong><small>${escapeHtml(detail)}</small></span><span class="memory-block-right"><span>${tag}</span><small>${sim.physicalRange(region)}</small></span>`;
      const cls = `memory-block ${region.type} ${region.color || ""} ${selected ? "selected" : ""}`;
      return region.type === "process"
        ? `<button type="button" class="${cls}" style="flex-grow:${region.size}" data-select="${region.pid}" aria-label="Inspect ${escapeHtml(region.name)}, PID ${region.pid}">${content}</button>`
        : `<div class="${cls}" style="flex-grow:${region.size}">${content}</div>`;
    }).join("");
  }

  function renderProcesses() {
    $("process-list").innerHTML = machine.processes.length ? machine.processes.map(process => `
      <button type="button" class="process-row ${machine.selectedPid === process.pid ? "selected" : ""}" data-select="${process.pid}">
        <span class="process-icon ${process.color}">${process.icon}</span>
        <span class="process-name"><strong>${process.name}</strong><small>PID ${process.pid} <span>·</span> ${process.description}</small></span>
        <span class="process-memory"><strong>${process.size} <small>MB</small></strong><small><i class="tiny-dot ${process.state === "completed" ? "finished" : ""}"></i> ${process.state === "completed" ? "COMPLETED" : "RUNNING"}</small></span>
        <span class="row-arrow">›</span>
      </button>`).join("") : `<div class="empty-state">No processes yet. Launch an app to get started.</div>`;
  }

  function renderAnatomy() {
    const process = processById(machine.selectedPid);
    $("anatomy-pid").textContent = process ? `PID ${process.pid}` : "NO PROCESS";
    $("anatomy-subtitle").textContent = process ? `A look inside ${process.name}'s virtual address space` : "Select a process to inspect its memory";
    if (!process) {
      $("anatomy-content").innerHTML = `<div class="empty-state">Select a process above or in the memory map.</div>`;
      return;
    }
    const program = process.program;
    const frames = program ? program.frames.slice().reverse() : [{ name: "main" }];
    const allocations = program ? program.allocations : [];
    const heapBytes = allocations.reduce((sum, item) => sum + item.size, 0);
    const stackDetails = program ? (frames.length ? frames.map(frame => `${escapeHtml(frame.name)}()`).join(" → ") : "No active frames") : "Function calls & local variables";
    const heapDetails = program ? (allocations.length ? allocations.map(item => `${escapeHtml(item.name)}: ${item.size} B @ ${sim.formatAddress(item.start, 4)}`).join(" · ") : "No active allocations") : "Dynamic allocations";
    $("anatomy-content").innerHTML = `
      <div class="anatomy-top"><span>${sim.formatAddress(sim.VIRTUAL_MEMORY_SIZE - 1, 4)}</span><span>VIRTUAL MEMORY <span class="info" title="Schematic virtual memory, not to scale">i</span></span></div>
      <div class="anatomy-layout">
        <div class="anatomy-stack">
          <div class="anatomy-segment stack-segment"><span class="segment-symbol">↓</span><div><strong>Stack</strong><small>${stackDetails}</small></div><span class="segment-meta">${program ? `${frames.length} FRAME${frames.length === 1 ? "" : "S"}` : "GROWS DOWN"}</span></div>
          <div class="space-between"><span>⋮</span> AVAILABLE SPACE <span>⋮</span></div>
          <div class="anatomy-segment heap-segment"><span class="segment-symbol">↑</span><div><strong>Heap</strong><small>${heapDetails}</small></div><span class="segment-meta">${program ? `${heapBytes} B USED` : "GROWS UP"}</span></div>
          <div class="anatomy-segment data-segment"><span class="segment-symbol">▥</span><div><strong>Data</strong><small>Global & static variables</small></div><span class="segment-meta">DATA</span></div>
          <div class="anatomy-segment code-segment"><span class="segment-symbol">&lt;/&gt;</span><div><strong>Code</strong><small>Program instructions</small></div><span class="segment-meta">TEXT</span></div>
        </div>
        <div class="anatomy-side"><div class="virtual-icon">◈</div><strong>Every process<br>gets its own space.</strong><p>Virtual memory gives each process an isolated view of memory.</p><span>NOT TO SCALE</span></div>
      </div>
      <div class="anatomy-bottom"><span>${sim.formatAddress(0, 4)}</span><button type="button" class="stop-button" data-stop="${process.pid}">■ &nbsp; Stop process</button></div>`;
  }

  function render() {
    const used = sim.SYSTEM_REGIONS.reduce((sum, region) => sum + region.size, 0) + machine.processes.reduce((sum, process) => sum + process.size, 0);
    $("used-memory").innerHTML = `${used} <small>MB</small>`;
    $("used-percent").textContent = `${Math.round(used / sim.TOTAL_MEMORY * 100)}% USED`;
    $("process-count").textContent = machine.processes.filter(process => process.state === "running").length;
    $("process-badge").textContent = machine.processes.length;
    renderMemory();
    renderProcesses();
    renderAnatomy();
    const program = processById(machine.programPid);
    $("step-button").disabled = !program || program.state !== "running";
    $("code-status").textContent = codeMessage;
  }

  function launch(key, program) {
    const process = sim.launch(machine, key, program);
    $("launch-status").textContent = "";
    log(`Started ${process.name} (PID ${process.pid}, ${process.size} MB).`, "terminal-success");
    render();
    return process;
  }

  function loadProgram(source) {
    const program = sim.parseProgram(source);
    const process = launch("lab", program);
    codeMessage = `PID ${process.pid} ready. Press Step to execute.`;
    render();
  }

  function updatePrompt() {
    const prompt = `guest@oslab:${fs.pwd()}$`;
    $("terminal-prompt").textContent = prompt;
    $("terminal-prompt").title = prompt;
    $("terminal-title").textContent = `guest@oslab: ${fs.pwd()}`;
  }

  function compileEditor() {
    const source = $("code-input").value;
    const result = teaching.compileProgram(sim.parseProgram(source));
    fs.writeFiles({ "program.c": source, "program.asm": result.assembly, "program.hex": result.machine });
    $("assembly-output").textContent = result.assembly;
    $("machine-output").textContent = result.machine;
    $("build-output").open = true;
    codeMessage = `Compiled into ${fs.pwd()}: program.c, program.asm and program.hex.`;
    log(codeMessage, "terminal-success");
    render();
  }

  $("launch-menu").innerHTML = Object.entries(sim.APPS).map(([key, app]) =>
    `<button type="button" data-launch="${key}"><span class="process-icon ${app.color}">${app.icon}</span><span><strong>${app.name}</strong><small>${app.size} MB · ${app.description}</small></span><span>＋</span></button>`
  ).join("");
  $("launch-toggle").addEventListener("click", () => $("launch-menu").classList.toggle("hidden"));
  document.addEventListener("click", event => {
    const launchButton = event.target.closest("[data-launch]");
    const selectButton = event.target.closest("[data-select]");
    const stopButton = event.target.closest("[data-stop]");
    if (launchButton) {
      $("launch-menu").classList.add("hidden");
      try {
        if (launchButton.dataset.launch === "lab") loadProgram($("code-input").value);
        else launch(launchButton.dataset.launch);
      } catch (error) {
        $("launch-status").textContent = error.message;
        if (launchButton.dataset.launch === "lab") codeMessage = error.message;
        log(error.message, "terminal-error");
        render();
      }
    } else if (selectButton) {
      machine.selectedPid = Number(selectButton.dataset.select);
      render();
    } else if (stopButton) {
      const pid = Number(stopButton.dataset.stop);
      const wasCurrentProgram = machine.programPid === pid;
      const process = sim.stop(machine, pid);
      log(`Stopped ${process.name} (PID ${process.pid}).`, "terminal-success");
      if (wasCurrentProgram) codeMessage = `PID ${process.pid} stopped. Load a program to start again.`;
      render();
    } else if (!event.target.closest(".launch-wrap")) {
      $("launch-menu").classList.add("hidden");
    }
  });

  $("code-input").value = sim.EXAMPLE;
  $("compile-button").addEventListener("click", () => {
    try { loadProgram($("code-input").value); }
    catch (error) { codeMessage = error.message; log(error.message, "terminal-error"); render(); }
  });
  $("build-button").addEventListener("click", () => {
    try { compileEditor(); }
    catch (error) { codeMessage = error.message; log(error.message, "terminal-error"); render(); }
  });
  $("step-button").addEventListener("click", () => {
    const process = processById(machine.programPid);
    try {
      codeMessage = sim.step(process);
      machine.selectedPid = process.pid;
      log(codeMessage, "terminal-success");
    } catch (error) {
      codeMessage = error.message;
      log(error.message, "terminal-error");
    }
    render();
  });

  $("terminal-form").addEventListener("submit", event => {
    event.preventDefault();
    const input = $("terminal-command");
    const command = input.value.trim();
    input.value = "";
    if (!command) return;
    log(`guest@oslab:${fs.pwd()}$ ${command}`, "terminal-command-echo");
    const [verb, ...args] = command.split(/\s+/);
    try {
      if (verb === "help" && !args.length) {
        log("Commands: pwd, ls [path], cd [path], mkdir <path>, cat <file>, compile, ps, mem, run <editor|browser|music|lab>, kill <pid>, clear");
      } else if (verb === "pwd" && !args.length) {
        log(fs.pwd());
      } else if (verb === "ls" && args.length <= 1) {
        const entries = fs.list(args[0]);
        log(entries.length ? entries.join("  ") : "(empty directory)");
      } else if (verb === "cd" && args.length <= 1) {
        fs.cd(args[0]);
        updatePrompt();
      } else if (verb === "mkdir" && args.length === 1) {
        fs.mkdir(args[0]);
      } else if (verb === "cat" && args.length === 1) {
        log(fs.read(args[0]));
      } else if (verb === "compile" && !args.length) {
        compileEditor();
      } else if (verb === "ps" && !args.length) {
        log("PID   STATE       MEMORY   NAME");
        machine.processes.forEach(process => log(`${String(process.pid).padEnd(5)} ${process.state.padEnd(11)} ${String(process.size + " MB").padEnd(8)} ${process.name}`));
        if (!machine.processes.length) log("No resident processes.");
      } else if (verb === "mem" && !args.length) {
        sim.regions(machine).slice().reverse().forEach(region => log(`${sim.physicalRange(region)}  ${region.size} MB  ${region.name}${region.pid ? ` (PID ${region.pid})` : ""}`));
      } else if (verb === "run" && args.length === 1) {
        if (args[0] === "lab") loadProgram($("code-input").value);
        else launch(args[0]);
      } else if (verb === "kill" && args.length === 1 && /^\d+$/.test(args[0])) {
        const pid = Number(args[0]);
        const wasCurrentProgram = machine.programPid === pid;
        const process = sim.stop(machine, pid);
        if (wasCurrentProgram) codeMessage = `PID ${process.pid} stopped. Load a program to start again.`;
        log(`Stopped ${process.name} (PID ${process.pid}).`, "terminal-success");
        render();
      } else if (verb === "clear" && !args.length) {
        output.replaceChildren();
      } else {
        throw new Error("Unknown command or invalid arguments. Type help for commands.");
      }
    } catch (error) { log(error.message, "terminal-error"); }
  });

  $("physical-high").textContent = sim.formatAddress(sim.TOTAL_MEMORY * sim.BYTES_PER_MB - 1, 8);
  $("physical-low").textContent = sim.formatAddress(0, 8);
  updatePrompt();
  sim.launch(machine, "editor");
  sim.launch(machine, "browser");
  machine.selectedPid = machine.processes[0].pid;
  log("Welcome to OS Lab. This is a simulated shell.");
  log("Type 'help' to see what you can do. Files reset on refresh.", "terminal-muted");
  render();
})();
