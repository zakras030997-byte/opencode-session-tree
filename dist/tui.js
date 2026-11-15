// @bun
// tui.tsx
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
import { createSignal, For, Show } from "solid-js";
import fs from "fs/promises";
import os from "os";
import path from "path";

// rpc.ts
import { Rpc } from "@opencode/plugin/rpc";
var ThreadDto = {
  type: "object",
  properties: {
    folder: { type: "string" },
    slug: { type: "string" },
    sessionID: { anyOf: [{ type: "string" }, { type: "null" }] },
    title: { type: "string" }
  },
  required: ["folder", "slug", "sessionID", "title"],
  additionalProperties: false
};
var ProjectDto = {
  type: "object",
  properties: {
    name: { type: "string" },
    path: { type: "string" },
    threads: { type: "array", items: ThreadDto }
  },
  required: ["name", "path", "threads"],
  additionalProperties: false
};
var treeOutput = {
  type: "object",
  properties: {
    projectsRoot: { type: "string" },
    projects: { type: "array", items: ProjectDto },
    loose: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          title: { type: "string" },
          directory: { type: "string" }
        },
        required: ["sessionID", "title", "directory"],
        additionalProperties: false
      }
    }
  },
  required: ["projectsRoot", "projects", "loose"],
  additionalProperties: false
};
var errors = {
  invalid_name: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false
  },
  exists: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false
  },
  not_found: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false
  },
  invalid_path: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false
  },
  occupied: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false
  },
  marker_missing: {
    type: "object",
    properties: { folder: { type: "string" } },
    required: ["folder"],
    additionalProperties: false
  }
};
var emptyInput = { type: "object", additionalProperties: false };
var TreeRpc = Rpc.define({
  id: "session-tree",
  methods: {
    listTree: { input: emptyInput, output: treeOutput },
    createProject: {
      input: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false
      },
      output: treeOutput,
      errors
    },
    renameProject: {
      input: {
        type: "object",
        properties: { path: { type: "string" }, name: { type: "string" } },
        required: ["path", "name"],
        additionalProperties: false
      },
      output: treeOutput,
      errors
    },
    deleteProject: {
      input: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false
      },
      output: {
        type: "object",
        properties: { removedSessions: { type: "integer" }, removedFolder: { type: "boolean" } },
        required: ["removedSessions", "removedFolder"],
        additionalProperties: false
      },
      errors
    },
    reorderProject: {
      input: {
        type: "object",
        properties: { path: { type: "string" }, target: { type: "string" } },
        required: ["path", "target"],
        additionalProperties: false
      },
      output: treeOutput,
      errors
    },
    createThread: {
      input: {
        type: "object",
        properties: { projectPath: { type: "string" }, slug: { type: "string" }, title: { type: "string" } },
        required: ["projectPath"],
        additionalProperties: false
      },
      output: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          title: { type: "string" },
          folder: { type: "string" }
        },
        required: ["sessionID", "title", "folder"],
        additionalProperties: false
      },
      errors
    },
    deleteThread: {
      input: {
        type: "object",
        properties: { projectPath: { type: "string" }, folder: { type: "string" }, sessionID: { type: "string" } },
        required: ["projectPath", "folder", "sessionID"],
        additionalProperties: false
      },
      output: {
        type: "object",
        properties: { removedFolder: { type: "boolean" } },
        required: ["removedFolder"],
        additionalProperties: false
      },
      errors
    },
    renameThread: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" }, title: { type: "string" } },
        required: ["sessionID", "title"],
        additionalProperties: false
      },
      output: emptyInput,
      errors
    },
    deleteSession: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false
      },
      output: emptyInput,
      errors
    },
    moveThread: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          folder: { type: "string" },
          targetProject: { type: "string" },
          slug: { type: "string" }
        },
        required: ["sessionID", "targetProject"],
        additionalProperties: false
      },
      output: {
        type: "object",
        properties: { folder: { type: "string" } },
        required: ["folder"],
        additionalProperties: false
      },
      errors
    },
    createLoose: {
      input: emptyInput,
      output: {
        type: "object",
        properties: { sessionID: { type: "string" }, title: { type: "string" } },
        required: ["sessionID", "title"],
        additionalProperties: false
      }
    }
  },
  events: {}
});

// tui.tsx
var EMPTY = {
  projectsRoot: "",
  projects: [],
  loose: []
};
var isRightClick = (e) => e?.button === 2;
var trunc = (s, n = 30) => s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
var ORANGE = "#ff8c00";
var GREEN = "#a6e3a1";
var tui_default = Plugin.define({
  id: "opencode-session-tree",
  async setup(context) {
    const [getTree, setTree] = createSignal(EMPTY);
    const [getExpanded, setExpanded] = createSignal(new Set);
    const [getUnread, setUnread] = createSignal({});
    const [getLive, setLive] = createSignal({});
    const currentSIDRef = {
      value: ""
    };
    let rerenderFn = null;
    const rpc = () => context.client.rpc(TreeRpc);
    const refresh = async () => {
      try {
        const t = await rpc().listTree({});
        setTree(t);
        const live = {
          ...getLive()
        };
        for (const p of t.projects) {
          for (const th of p.threads) {
            if (!th.sessionID)
              continue;
            try {
              const s = context.data.session.status(th.sessionID);
              const txt = typeof s === "string" ? s : JSON.stringify(s ?? "");
              live[th.sessionID] = /run|busy|active|work|pending|stream/i.test(txt);
            } catch {}
          }
        }
        setLive(live);
        rerenderFn?.();
      } catch {}
    };
    await refresh();
    let last = 0;
    const stopListen = context.data.listen((event) => {
      const details = event?.details ?? {};
      const type = details.type ?? event?.type ?? "";
      const sid = details.info?.id ?? details.sessionID ?? event?.sessionID ?? "";
      if (typeof type !== "string")
        return;
      if (/execution\.succeeded|session\.idle|turn\.completed|message\.updated/.test(type) && sid && sid !== currentSIDRef.value) {
        setUnread((m) => ({
          ...m,
          [sid]: true
        }));
        rerenderFn?.();
      }
      if (type.includes("session") && Date.now() - last > 1000) {
        last = Date.now();
        refresh();
      }
    });
    const openSession = (sessionID) => {
      setUnread((m) => ({
        ...m,
        [sessionID]: false
      }));
      context.ui.router.navigate({
        type: "session",
        sessionID
      });
    };
    const toastOk = (message) => context.ui.toast.show({
      title: "session-tree",
      message,
      variant: "success"
    });
    const toastError = (e) => context.ui.toast.show({
      title: "session-tree",
      message: e instanceof Error ? e.message : String(e),
      variant: "error"
    });
    const toggleExpanded = (name) => {
      const next = new Set(getExpanded());
      if (next.has(name))
        next.delete(name);
      else
        next.add(name);
      setExpanded(next);
      rerenderFn?.();
    };
    const pickProject = async () => {
      const projects = getTree().projects;
      if (projects.length === 0) {
        context.ui.toast.show({
          title: "session-tree",
          message: "\u041D\u0435\u0442 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432",
          variant: "info"
        });
        return null;
      }
      return context.ui.dialog.select({
        title: "\u041F\u0440\u043E\u0435\u043A\u0442\u044B",
        options: projects.map((p) => ({
          title: p.name,
          value: p.path,
          description: p.path
        }))
      });
    };
    const pickThread = async () => {
      const t = getTree();
      const options = [...t.projects.flatMap((p) => p.threads.filter((th) => th.sessionID).map((th) => ({
        title: th.title,
        value: `${p.path}
${th.folder}
${th.sessionID}`,
        category: p.name,
        description: th.folder
      }))), ...t.loose.map((s) => ({
        title: s.title,
        value: `

${s.sessionID}`,
        category: "\u0411\u0435\u0437 \u043F\u0440\u043E\u0435\u043A\u0442\u0430"
      }))];
      if (options.length === 0) {
        context.ui.toast.show({
          title: "session-tree",
          message: "\u041D\u0435\u0442 \u0442\u0440\u0435\u0434\u043E\u0432",
          variant: "info"
        });
        return null;
      }
      return context.ui.dialog.select({
        title: "\u0422\u0440\u0435\u0434\u044B",
        options
      });
    };
    const parsePick = (v) => {
      const [projectPath, folder, sessionID] = v.split(`
`);
      return {
        projectPath,
        folder,
        sessionID
      };
    };
    const newProject = async () => {
      const name = await context.ui.dialog.prompt({
        title: "\u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442",
        placeholder: "\u0438\u043C\u044F-\u043F\u0440\u043E\u0435\u043A\u0442\u0430"
      });
      if (!name?.trim())
        return;
      try {
        await rpc().createProject({
          name: name.trim()
        });
        await refresh();
        toastOk(`\u041F\u0440\u043E\u0435\u043A\u0442 \u0441\u043E\u0437\u0434\u0430\u043D: ${name.trim()}`);
      } catch (e) {
        toastError(e);
      }
    };
    const newThreadIn = async (projectPath) => {
      const name = await context.ui.dialog.prompt({
        title: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0442\u0440\u0435\u0434\u0430",
        placeholder: "\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: auth-refactor"
      });
      if (!name?.trim())
        return;
      try {
        const res = await rpc().createThread({
          projectPath,
          title: name.trim()
        });
        await refresh();
        openSession(res.sessionID);
        toastOk(`\u0421\u043E\u0437\u0434\u0430\u043D \u0442\u0440\u0435\u0434: ${res.folder}`);
      } catch (e) {
        toastError(e);
      }
    };
    const newThread = async () => {
      const t = getTree();
      const options = [...t.projects.map((p) => ({
        title: p.name,
        value: p.path,
        category: "\u041F\u0440\u043E\u0435\u043A\u0442\u044B"
      })), {
        title: "\u0411\u0435\u0437 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 (\u0442\u0435\u043A\u0443\u0449\u0430\u044F \u043F\u0430\u043F\u043A\u0430)",
        value: "\x00loose",
        category: "\u041F\u0440\u043E\u0447\u0435\u0435"
      }];
      const picked = await context.ui.dialog.select({
        title: "\u041D\u043E\u0432\u044B\u0439 \u0442\u0440\u0435\u0434 \u2014 \u0433\u0434\u0435?",
        options
      });
      if (!picked)
        return;
      if (picked === "\x00loose") {
        try {
          const res = await rpc().createLoose({});
          openSession(res.sessionID);
        } catch (e) {
          toastError(e);
        }
        return;
      }
      await newThreadIn(picked);
    };
    const openThreadCmd = async () => {
      const picked = await pickThread();
      if (picked)
        openSession(parsePick(picked).sessionID);
    };
    const renameThreadDirect = async (sessionID) => {
      const title = await context.ui.dialog.prompt({
        title: "\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u0442\u0440\u0435\u0434",
        placeholder: "\u041D\u043E\u0432\u043E\u0435 \u0438\u043C\u044F"
      });
      if (!title?.trim())
        return;
      try {
        await rpc().renameThread({
          sessionID,
          title: title.trim()
        });
        await refresh();
        toastOk("\u0422\u0440\u0435\u0434 \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D");
      } catch (e) {
        toastError(e);
      }
    };
    const deleteThreadDirect = async (target) => {
      const isProjectThread = !!target.projectPath && !!target.folder;
      const confirmed = await context.ui.dialog.confirm({
        title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0442\u0440\u0435\u0434?",
        message: isProjectThread ? `\u0421\u0435\u0441\u0441\u0438\u044F \u0438 \u043F\u0430\u043F\u043A\u0430 \u0431\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043B\u0435\u043D\u044B \u0431\u0435\u0437\u0432\u043E\u0437\u0432\u0440\u0430\u0442\u043D\u043E:
${target.folder}` : `\u0421\u0435\u0441\u0441\u0438\u044F \u0431\u0443\u0434\u0435\u0442 \u0443\u0434\u0430\u043B\u0435\u043D\u0430 \u0431\u0435\u0437\u0432\u043E\u0437\u0432\u0440\u0430\u0442\u043D\u043E:
${target.sessionID}`,
        label: {
          confirm: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
          cancel: "\u041E\u0442\u043C\u0435\u043D\u0430"
        }
      });
      if (!confirmed)
        return;
      try {
        if (isProjectThread) {
          const res = await rpc().deleteThread({
            projectPath: target.projectPath,
            folder: target.folder,
            sessionID: target.sessionID
          });
          await refresh();
          toastOk(res.removedFolder ? "\u0422\u0440\u0435\u0434 \u0438 \u043F\u0430\u043F\u043A\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u044B" : "\u0423\u0434\u0430\u043B\u0435\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0435\u0441\u0441\u0438\u044F");
        } else {
          await rpc().deleteSession({
            sessionID: target.sessionID
          });
          await refresh();
          toastOk("\u0421\u0435\u0441\u0441\u0438\u044F \u0443\u0434\u0430\u043B\u0435\u043D\u0430");
        }
      } catch (e) {
        toastError(e);
      }
    };
    const renameProjectDirect = async (projectPath) => {
      const project = getTree().projects.find((p) => p.path === projectPath);
      const name = await context.ui.dialog.prompt({
        title: "\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442",
        placeholder: project?.name ?? "\u043D\u043E\u0432\u043E\u0435-\u0438\u043C\u044F"
      });
      if (!name?.trim())
        return;
      try {
        await rpc().renameProject({
          path: projectPath,
          name: name.trim()
        });
        await refresh();
        toastOk("\u041F\u0440\u043E\u0435\u043A\u0442 \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D");
      } catch (e) {
        toastError(e);
      }
    };
    const deleteProjectDirect = async (projectPath) => {
      const project = getTree().projects.find((p) => p.path === projectPath);
      const total = project?.threads.length ?? 0;
      const confirmed = await context.ui.dialog.confirm({
        title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442?",
        message: `\u0411\u0443\u0434\u0443\u0442 \u0431\u0435\u0437\u0432\u043E\u0437\u0432\u0440\u0430\u0442\u043D\u043E \u0443\u0434\u0430\u043B\u0435\u043D\u044B:
${projectPath}
${total} \u0442\u0440\u0435\u0434(\u043E\u0432), \u0438\u0445 \u0441\u0435\u0441\u0441\u0438\u0438, \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0438 \u0444\u0430\u0439\u043B\u044B.`,
        label: {
          confirm: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0451",
          cancel: "\u041E\u0442\u043C\u0435\u043D\u0430"
        }
      });
      if (!confirmed)
        return;
      try {
        const res = await rpc().deleteProject({
          path: projectPath
        });
        await refresh();
        toastOk(`\u041F\u0440\u043E\u0435\u043A\u0442 \u0443\u0434\u0430\u043B\u0451\u043D: \u0441\u0435\u0441\u0441\u0438\u0439 ${res.removedSessions}, \u043F\u0430\u043F\u043A\u0430 ${res.removedFolder ? "\u0443\u0434\u0430\u043B\u0435\u043D\u0430" : "\u043E\u0441\u0442\u0430\u043B\u0430\u0441\u044C"}`);
      } catch (e) {
        toastError(e);
      }
    };
    const refreshCmd = async () => {
      await refresh();
      context.ui.toast.show({
        title: "session-tree",
        message: "\u0414\u0435\u0440\u0435\u0432\u043E \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
        variant: "info"
      });
    };
    const copyIdCmd = async (id) => {
      await context.ui.dialog.alert({
        title: "Session ID",
        message: id
      });
    };
    const toggleSidebar = async () => {
      const cliConfig = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "opencode", "cli.json");
      let cfg = {};
      try {
        cfg = JSON.parse(await fs.readFile(cliConfig, "utf8"));
      } catch {}
      const current = cfg.session?.sidebar ?? "auto";
      const next = current === "hide" ? "auto" : "hide";
      cfg.$schema = cfg.$schema ?? "https://opencode.ai/v2/cli.json";
      cfg.session = {
        ...cfg.session ?? {},
        sidebar: next
      };
      await fs.mkdir(path.dirname(cliConfig), {
        recursive: true
      });
      await fs.writeFile(cliConfig, JSON.stringify(cfg, null, 2) + `
`);
      context.ui.toast.show({
        title: "session-tree",
        message: next === "hide" ? "\u0421\u0430\u0439\u0434\u0431\u0430\u0440 \u0441\u043A\u0440\u044B\u0442" : "\u0421\u0430\u0439\u0434\u0431\u0430\u0440 \u0432\u043A\u043B\u044E\u0447\u0451\u043D",
        variant: "info"
      });
    };
    const moveThreadDirect = async (target) => {
      const projects = getTree().projects.filter((p) => p.path !== target.projectPath);
      if (projects.length === 0) {
        context.ui.toast.show({
          title: "session-tree",
          message: "\u041D\u0435\u0442 \u0434\u0440\u0443\u0433\u0438\u0445 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432",
          variant: "info"
        });
        return;
      }
      const targetProject = await context.ui.dialog.select({
        title: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0432 \u043F\u0440\u043E\u0435\u043A\u0442\u2026",
        options: projects.map((p) => ({
          title: p.name,
          value: p.path,
          description: p.path
        }))
      });
      if (!targetProject)
        return;
      try {
        const res = await rpc().moveThread({
          sessionID: target.sessionID,
          folder: target.folder,
          targetProject
        });
        await refresh();
        toastOk(`\u041F\u0435\u0440\u0435\u043C\u0435\u0449\u0451\u043D: ${res.folder}`);
      } catch (e) {
        toastError(e);
      }
    };
    const renameThreadCmd = async () => {
      const picked = await pickThread();
      if (picked)
        await renameThreadDirect(parsePick(picked).sessionID);
    };
    const deleteThreadCmd = async () => {
      const picked = await pickThread();
      if (picked) {
        const {
          projectPath,
          folder,
          sessionID
        } = parsePick(picked);
        await deleteThreadDirect({
          projectPath,
          folder,
          sessionID
        });
      }
    };
    const renameProjectCmd = async () => {
      const target = await pickProject();
      if (target)
        await renameProjectDirect(target);
    };
    const deleteProjectCmd = async () => {
      const target = await pickProject();
      if (target)
        await deleteProjectDirect(target);
    };
    const projectMenu = async (project) => {
      const action = await context.ui.dialog.select({
        title: project.name,
        options: [{
          title: "\u041D\u043E\u0432\u044B\u0439 \u0442\u0440\u0435\u0434",
          value: "new",
          description: "threads/<\u0438\u043C\u044F>/ + \u0441\u0435\u0441\u0441\u0438\u044F"
        }, {
          title: "\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442",
          value: "rename"
        }, {
          title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442 (\u043F\u043E\u043B\u043D\u0430\u044F \u0437\u0430\u0447\u0438\u0441\u0442\u043A\u0430)",
          value: "delete"
        }]
      });
      if (action === "new")
        await newThreadIn(project.path);
      else if (action === "rename")
        await renameProjectDirect(project.path);
      else if (action === "delete")
        await deleteProjectDirect(project.path);
    };
    const threadMenu = async (projectPath, th) => {
      if (!th.sessionID)
        return;
      const action = await context.ui.dialog.select({
        title: th.title,
        options: [{
          title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C",
          value: "open"
        }, {
          title: "\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C",
          value: "rename"
        }, {
          title: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u043F\u0440\u043E\u0435\u043A\u0442\u2026",
          value: "move"
        }, {
          title: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C ID",
          value: "copy"
        }, {
          title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
          value: "delete"
        }]
      });
      if (action === "open")
        openSession(th.sessionID);
      else if (action === "rename")
        await renameThreadDirect(th.sessionID);
      else if (action === "move")
        await moveThreadDirect({
          projectPath,
          folder: th.folder,
          sessionID: th.sessionID
        });
      else if (action === "copy")
        await copyIdCmd(th.sessionID);
      else if (action === "delete")
        await deleteThreadDirect({
          projectPath,
          folder: th.folder,
          sessionID: th.sessionID
        });
    };
    const looseMenu = async (s) => {
      const action = await context.ui.dialog.select({
        title: s.title,
        options: [{
          title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C",
          value: "open"
        }, {
          title: "\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C",
          value: "rename"
        }, {
          title: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0432 \u043F\u0440\u043E\u0435\u043A\u0442 (\u0441\u043E\u0437\u0434\u0430\u0441\u0442 \u043F\u043E\u0434\u043F\u0430\u043F\u043A\u0443)\u2026",
          value: "move"
        }, {
          title: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C ID",
          value: "copy"
        }, {
          title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
          value: "delete"
        }]
      });
      if (action === "open")
        openSession(s.sessionID);
      else if (action === "rename")
        await renameThreadDirect(s.sessionID);
      else if (action === "move")
        await moveThreadDirect({
          sessionID: s.sessionID
        });
      else if (action === "copy")
        await copyIdCmd(s.sessionID);
      else if (action === "delete")
        await deleteThreadDirect({
          sessionID: s.sessionID
        });
    };
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "session-tree.open",
        title: "\u0414\u0435\u0440\u0435\u0432\u043E: \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u0440\u0435\u0434",
        slash: {
          name: "tree"
        },
        palette: true,
        run: openThreadCmd
      }, {
        id: "session-tree.new",
        title: "\u0414\u0435\u0440\u0435\u0432\u043E: \u043D\u043E\u0432\u044B\u0439 \u0442\u0440\u0435\u0434",
        slash: {
          name: "tree-new"
        },
        palette: true,
        run: newThread
      }, {
        id: "session-tree.new-project",
        title: "\u0414\u0435\u0440\u0435\u0432\u043E: \u043D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442",
        slash: {
          name: "tree-project-new"
        },
        palette: true,
        run: newProject
      }, {
        id: "session-tree.rename",
        title: "\u0414\u0435\u0440\u0435\u0432\u043E: \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u0442\u0440\u0435\u0434",
        palette: true,
        run: renameThreadCmd
      }, {
        id: "session-tree.delete",
        title: "\u0414\u0435\u0440\u0435\u0432\u043E: \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0442\u0440\u0435\u0434",
        palette: true,
        run: deleteThreadCmd
      }, {
        id: "session-tree.rename-project",
        title: "\u0414\u0435\u0440\u0435\u0432\u043E: \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442",
        palette: true,
        run: renameProjectCmd
      }, {
        id: "session-tree.delete-project",
        title: "\u0414\u0435\u0440\u0435\u0432\u043E: \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442",
        palette: true,
        run: deleteProjectCmd
      }, {
        id: "session-tree.sidebar",
        title: "\u0414\u0435\u0440\u0435\u0432\u043E: \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C/\u0441\u043A\u0440\u044B\u0442\u044C \u0441\u0430\u0439\u0434\u0431\u0430\u0440",
        slash: {
          name: "tree-sidebar"
        },
        palette: true,
        run: toggleSidebar
      }, {
        id: "session-tree.refresh",
        title: "\u0414\u0435\u0440\u0435\u0432\u043E: \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
        palette: true,
        run: refreshCmd
      }],
      bindings: []
    }));
    const muted = context.theme.text?.muted ?? context.theme.text.base;
    const HEADER = "\u041F\u0420\u041E\u0415\u041A\u0422\u042B";
    let dragName = null;
    let dragEl = null;
    let hoverName = null;
    let pressName = null;
    let pressY = -1;
    let swallowClick = false;
    const swallowUp = () => {
      swallowClick = true;
      queueMicrotask(() => {
        swallowClick = false;
      });
    };
    const projectLabel = (p) => `${getExpanded().has(p.name) ? "\u25BE" : "\u25B8"} ${trunc(p.name, 26)} \xB7 ${p.threads.length} `;
    const paint = (el, content, fg) => {
      const row = el;
      if (!row)
        return;
      try {
        if (content !== undefined)
          row.content = content;
        if (fg !== undefined)
          row.fg = fg;
      } catch {}
    };
    const resetInteraction = () => {
      dragName = null;
      dragEl = null;
      hoverName = null;
      pressName = null;
      pressY = -1;
    };
    const startPress = (e, name) => {
      resetInteraction();
      pressName = name;
      pressY = typeof e?.y === "number" ? e.y : -1;
    };
    const armDrag = (e, project) => {
      if (dragName || pressName !== project.name || pressY < 0)
        return;
      const y = e?.y;
      if (typeof y !== "number" || Math.abs(y - pressY) < 1)
        return;
      dragName = project.name;
      dragEl = e.target ?? null;
      paint(dragEl, `\u22EE ${trunc(project.name, 24)} \xB7 ${project.threads.length} `, muted);
    };
    const releaseDrag = () => {
      swallowUp();
      pressName = null;
      pressY = -1;
      const project = dragName ? getTree().projects.find((p) => p.name === dragName) : undefined;
      if (project)
        paint(dragEl, projectLabel(project), ORANGE);
      dragEl = null;
      queueMicrotask(() => {
        const over = hoverName;
        hoverName = null;
        if (!dragName || !over)
          return;
        const target = getTree().projects.find((p) => p.name === over);
        if (target)
          dropOn(target);
      });
    };
    const dropOn = async (project) => {
      swallowUp();
      const name = dragName;
      dragName = null;
      dragEl = null;
      hoverName = null;
      pressName = null;
      pressY = -1;
      if (!name || name === project.name)
        return;
      const from = getTree().projects.find((p) => p.name === name);
      if (!from)
        return;
      try {
        await rpc().reorderProject({
          path: from.path,
          target: project.path
        });
        await refresh();
        toastOk(`\xAB${name}\xBB \u2014 \u043D\u0430 \u043C\u0435\u0441\u0442\u0435 \xAB${project.name}\xBB`);
      } catch (e) {
        toastError(e);
        await refresh();
      }
    };
    const cancelDrop = () => resetInteraction();
    const rowFor = (th, loose) => {
      const sid = th.sessionID ?? loose?.sessionID ?? null;
      const title = th.title ?? loose?.title ?? "";
      const live = sid ? !!getLive()[sid] : false;
      const unread = sid ? !!getUnread()[sid] : false;
      const marker = live ? "\u25CF" : unread ? "\u25C9" : "\xB7";
      const fg = live ? GREEN : unread ? ORANGE : th.sessionID ? context.theme.text.base : muted;
      return {
        marker,
        fg,
        title: trunc(title, 30)
      };
    };
    const renderTree = (t) => (() => {
      var _el$ = _$createElement("box"), _el$2 = _$createElement("box"), _el$3 = _$createElement("text");
      _$insertNode(_el$, _el$2);
      _$setProp(_el$, "flexDirection", "column");
      _$setProp(_el$, "marginTop", 1);
      _$insertNode(_el$2, _el$3);
      _$setProp(_el$2, "flexDirection", "row");
      _$setProp(_el$2, "width", "100%");
      _$setProp(_el$2, "justifyContent", "center");
      _$setProp(_el$2, "onMouseDown", resetInteraction);
      _$setProp(_el$2, "onMouseUp", () => {
        if (dragName || swallowClick)
          return;
        newProject();
      });
      _$insertNode(_el$3, _$createTextNode(`\u2500 \u041F\u0420\u041E\u0415\u041A\u0422\u042B \u2500`));
      _$setProp(_el$3, "fg", "yellow");
      _$setProp(_el$3, "selectable", false);
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return t.projects.length > 0;
        },
        get fallback() {
          return (() => {
            var _el$7 = _$createElement("text");
            _$insertNode(_el$7, _$createTextNode(` \u041D\u0435\u0442 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432 \u2014 \xAB+\xBB \u0438\u043B\u0438 /tree-project-new`));
            _$setProp(_el$7, "fg", muted);
            return _el$7;
          })();
        },
        get children() {
          return _$createComponent(For, {
            get each() {
              return t.projects;
            },
            children: (project) => (() => {
              var _el$9 = _$createElement("box"), _el$0 = _$createElement("box"), _el$1 = _$createElement("text"), _el$10 = _$createElement("box"), _el$11 = _$createElement("text");
              _$insertNode(_el$9, _el$0);
              _$setProp(_el$9, "flexDirection", "column");
              _$insertNode(_el$0, _el$1);
              _$insertNode(_el$0, _el$10);
              _$setProp(_el$0, "flexDirection", "row");
              _$setProp(_el$1, "fg", "#ff8c00");
              _$setProp(_el$1, "selectable", false);
              _$setProp(_el$1, "onMouseDown", (e) => startPress(e, project.name));
              _$setProp(_el$1, "onMouseUp", (e) => {
                if (isRightClick(e)) {
                  resetInteraction();
                  projectMenu(project);
                  return;
                }
                if (dragName || swallowClick)
                  return;
                toggleExpanded(project.name);
              });
              _$setProp(_el$1, "onMouseDrag", (e) => armDrag(e, project));
              _$setProp(_el$1, "onMouseDragEnd", releaseDrag);
              _$setProp(_el$1, "onMouseDrop", () => void dropOn(project));
              _$setProp(_el$1, "onMouseOver", (e) => {
                if (!dragName)
                  return;
                if (dragName === project.name) {
                  hoverName = null;
                  return;
                }
                hoverName = project.name;
                paint(e.target, undefined, "yellow");
              });
              _$setProp(_el$1, "onMouseOut", (e) => {
                if (!dragName)
                  return;
                if (hoverName === project.name)
                  hoverName = null;
                if (dragName === project.name)
                  return;
                paint(e.target, undefined, ORANGE);
              });
              _$insert(_el$1, () => projectLabel(project));
              _$insertNode(_el$10, _el$11);
              _$setProp(_el$10, "onMouseDown", resetInteraction);
              _$setProp(_el$10, "onMouseUp", () => {
                if (dragName || swallowClick)
                  return;
                newThreadIn(project.path);
              });
              _$setProp(_el$10, "onMouseDrop", () => void dropOn(project));
              _$setProp(_el$10, "paddingLeft", 1);
              _$setProp(_el$10, "paddingRight", 1);
              _$insertNode(_el$11, _$createTextNode(`+`));
              _$setProp(_el$11, "fg", "yellow");
              _$setProp(_el$11, "selectable", false);
              _$insert(_el$9, _$createComponent(Show, {
                get when() {
                  return getExpanded().has(project.name);
                },
                get children() {
                  return _$createComponent(For, {
                    get each() {
                      return project.threads;
                    },
                    children: (th) => {
                      const r = rowFor(th, undefined);
                      return (() => {
                        var _el$13 = _$createElement("text");
                        _$setProp(_el$13, "selectable", false);
                        _$setProp(_el$13, "onMouseDown", (e) => {
                          resetInteraction();
                          if (isRightClick(e) || !th.sessionID)
                            return;
                          openSession(th.sessionID);
                        });
                        _$setProp(_el$13, "onMouseUp", (e) => {
                          if (!isRightClick(e))
                            return;
                          resetInteraction();
                          threadMenu(project.path, th);
                        });
                        _$setProp(_el$13, "onMouseDrop", () => void dropOn(project));
                        _$insert(_el$13, () => `    ${r.marker} ${r.title}`);
                        _$effect((_$p) => _$setProp(_el$13, "fg", r.fg, _$p));
                        return _el$13;
                      })();
                    }
                  });
                }
              }), null);
              return _el$9;
            })()
          });
        }
      }), null);
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return t.loose.length > 0;
        },
        get children() {
          var _el$5 = _$createElement("box"), _el$6 = _$createElement("text");
          _$insertNode(_el$5, _el$6);
          _$setProp(_el$5, "flexDirection", "column");
          _$setProp(_el$5, "marginTop", 1);
          _$setProp(_el$6, "fg", muted);
          _$insert(_el$6, () => `\u0411\u0415\u0417 \u041F\u0420\u041E\u0415\u041A\u0422\u0410 ${t.loose.length}`);
          _$insert(_el$5, _$createComponent(For, {
            get each() {
              return t.loose;
            },
            children: (s) => {
              const r = rowFor({
                folder: "",
                slug: "",
                sessionID: s.sessionID,
                title: s.title
              }, s);
              return (() => {
                var _el$14 = _$createElement("text");
                _$setProp(_el$14, "selectable", false);
                _$setProp(_el$14, "onMouseDown", (e) => {
                  resetInteraction();
                  if (isRightClick(e))
                    return;
                  openSession(s.sessionID);
                });
                _$setProp(_el$14, "onMouseUp", (e) => {
                  if (!isRightClick(e))
                    return;
                  resetInteraction();
                  looseMenu(s);
                });
                _$setProp(_el$14, "onMouseDrop", cancelDrop);
                _$insert(_el$14, () => `  ${r.marker} ${r.title}`);
                _$effect((_$p) => _$setProp(_el$14, "fg", r.fg, _$p));
                return _el$14;
              })();
            }
          }), null);
          return _el$5;
        }
      }), null);
      return _el$;
    })();
    let slotReg = null;
    rerenderFn = () => {
      slotReg?.();
      const snapshot = getTree();
      slotReg = context.ui.slot({
        append: "sidebar.content",
        render: (props) => {
          currentSIDRef.value = props?.sessionID ?? currentSIDRef.value;
          return renderTree(snapshot);
        }
      });
    };
    rerenderFn();
    return () => {
      stopListen();
      slotReg?.();
    };
  }
});
export {
  tui_default as default
};
