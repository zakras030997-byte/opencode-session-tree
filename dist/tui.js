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
var tui_default = Plugin.define({
  id: "opencode-session-tree",
  async setup(context) {
    const [getTree, setTree] = createSignal(EMPTY);
    const [getExpanded, setExpanded] = createSignal(new Set);
    let rerenderFn = null;
    const rpc = () => context.client.rpc(TreeRpc);
    const refresh = async () => {
      try {
        setTree(await rpc().listTree({}));
        rerenderFn?.();
      } catch {}
    };
    await refresh();
    let last = 0;
    const stopListen = context.data.listen((event) => {
      const type = event?.details?.type ?? event?.type ?? "";
      if (typeof type === "string" && type.includes("session") && Date.now() - last > 1000) {
        last = Date.now();
        refresh();
      }
    });
    const openSession = (sessionID) => {
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
        id: "session-tree.refresh",
        title: "\u0414\u0435\u0440\u0435\u0432\u043E: \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
        palette: true,
        run: refreshCmd
      }],
      bindings: []
    }));
    const muted = context.theme.text?.muted ?? context.theme.text.base;
    const HEADER = "\u041F\u0420\u041E\u0415\u041A\u0422\u042B";
    const renderTree = (t) => (() => {
      var _el$ = _$createElement("box"), _el$2 = _$createElement("box"), _el$3 = _$createElement("text");
      _$insertNode(_el$, _el$2);
      _$setProp(_el$, "flexDirection", "column");
      _$setProp(_el$, "marginTop", 1);
      _$insertNode(_el$2, _el$3);
      _$setProp(_el$2, "flexDirection", "row");
      _$setProp(_el$2, "width", "100%");
      _$setProp(_el$2, "justifyContent", "center");
      _$setProp(_el$2, "onMouseUp", () => void newProject());
      _$insertNode(_el$3, _$createTextNode(`\u2500 \u041F\u0420\u041E\u0415\u041A\u0422\u042B \u2500`));
      _$setProp(_el$3, "fg", "yellow");
      _$setProp(_el$3, "attributes", {
        bold: true
      });
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
              _$setProp(_el$1, "onMouseDown", (e) => {
                if (isRightClick(e))
                  return;
                toggleExpanded(project.name);
              });
              _$setProp(_el$1, "onMouseUp", (e) => {
                if (isRightClick(e))
                  projectMenu(project);
              });
              _$insert(_el$1, () => `${getExpanded().has(project.name) ? "\u25BE" : "\u25B8"} ${project.name} \xB7 ${project.threads.length} `);
              _$insertNode(_el$10, _el$11);
              _$setProp(_el$10, "onMouseUp", () => void newThreadIn(project.path));
              _$setProp(_el$10, "paddingLeft", 1);
              _$setProp(_el$10, "paddingRight", 1);
              _$insertNode(_el$11, _$createTextNode(`+`));
              _$setProp(_el$11, "fg", "yellow");
              _$insert(_el$9, _$createComponent(Show, {
                get when() {
                  return getExpanded().has(project.name);
                },
                get children() {
                  return _$createComponent(For, {
                    get each() {
                      return project.threads;
                    },
                    children: (th) => (() => {
                      var _el$13 = _$createElement("text");
                      _$setProp(_el$13, "onMouseDown", (e) => {
                        if (isRightClick(e) || !th.sessionID)
                          return;
                        openSession(th.sessionID);
                      });
                      _$setProp(_el$13, "onMouseUp", (e) => {
                        if (isRightClick(e))
                          threadMenu(project.path, th);
                      });
                      _$insert(_el$13, () => `    \xB7 ${th.title}`);
                      _$effect((_$p) => _$setProp(_el$13, "fg", th.sessionID ? context.theme.text.base : muted, _$p));
                      return _el$13;
                    })()
                  });
                }
              }), null);
              _$effect((_$p) => _$setProp(_el$1, "fg", context.theme.text.base, _$p));
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
            children: (s) => (() => {
              var _el$14 = _$createElement("text");
              _$setProp(_el$14, "onMouseDown", (e) => {
                if (isRightClick(e))
                  return;
                openSession(s.sessionID);
              });
              _$setProp(_el$14, "onMouseUp", (e) => {
                if (isRightClick(e))
                  looseMenu(s);
              });
              _$insert(_el$14, () => `  \xB7 ${s.title}`);
              _$effect((_$p) => _$setProp(_el$14, "fg", context.theme.text.base, _$p));
              return _el$14;
            })()
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
        render: () => renderTree(snapshot)
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
