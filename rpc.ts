import { Rpc } from "@opencode/plugin/rpc"

// RPC-контракт local.session-tree (v0.4: проекты живут в каталоге OpenCode, авто-привязка).

const ThreadDto = {
  type: "object",
  properties: {
    folder: { type: "string" },
    slug: { type: "string" },
    sessionID: { anyOf: [{ type: "string" }, { type: "null" }] },
    title: { type: "string" },
  },
  required: ["folder", "slug", "sessionID", "title"],
  additionalProperties: false,
}

const ProjectDto = {
  type: "object",
  properties: {
    name: { type: "string" },
    path: { type: "string" },
    threads: { type: "array", items: ThreadDto },
  },
  required: ["name", "path", "threads"],
  additionalProperties: false,
}

const treeOutput = {
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
          directory: { type: "string" },
        },
        required: ["sessionID", "title", "directory"],
        additionalProperties: false,
      },
    },
  },
  required: ["projectsRoot", "projects", "loose"],
  additionalProperties: false,
}

const errors = {
  invalid_name: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  },
  exists: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
  not_found: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
  invalid_path: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
  occupied: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
  marker_missing: {
    type: "object",
    properties: { folder: { type: "string" } },
    required: ["folder"],
    additionalProperties: false,
  },
} as const

const emptyInput = { type: "object", additionalProperties: false }

export const TreeRpc = Rpc.define({
  id: "session-tree",
  methods: {
    // У каждого метода обязательна input-схема (квирк рантайма, спека 6.1).
    listTree: { input: emptyInput, output: treeOutput },

    createProject: {
      input: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      output: treeOutput,
      errors,
    },

    renameProject: {
      input: {
        type: "object",
        properties: { path: { type: "string" }, name: { type: "string" } },
        required: ["path", "name"],
        additionalProperties: false,
      },
      output: treeOutput,
      errors,
    },

    deleteProject: {
      input: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { removedSessions: { type: "integer" }, removedFolder: { type: "boolean" } },
        required: ["removedSessions", "removedFolder"],
        additionalProperties: false,
      },
      errors,
    },

    // Перестановка проектов в сайдбаре (drag и клавиатура): путь встаёт на место target.
    reorderProject: {
      input: {
        type: "object",
        properties: { path: { type: "string" }, target: { type: "string" } },
        required: ["path", "target"],
        additionalProperties: false,
      },
      output: treeOutput,
      errors,
    },

    createThread: {
      input: {
        type: "object",
        properties: { projectPath: { type: "string" }, slug: { type: "string" }, title: { type: "string" } },
        required: ["projectPath"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          title: { type: "string" },
          folder: { type: "string" },
        },
        required: ["sessionID", "title", "folder"],
        additionalProperties: false,
      },
      errors,
    },

    deleteThread: {
      input: {
        type: "object",
        properties: { projectPath: { type: "string" }, folder: { type: "string" }, sessionID: { type: "string" } },
        required: ["projectPath", "folder", "sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { removedFolder: { type: "boolean" } },
        required: ["removedFolder"],
        additionalProperties: false,
      },
      errors,
    },

    renameThread: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" }, title: { type: "string" } },
        required: ["sessionID", "title"],
        additionalProperties: false,
      },
      output: emptyInput,
      errors,
    },

    deleteSession: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: emptyInput,
      errors,
    },

    moveThread: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          folder: { type: "string" },
          targetProject: { type: "string" },
          slug: { type: "string" },
        },
        required: ["sessionID", "targetProject"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { folder: { type: "string" } },
        required: ["folder"],
        additionalProperties: false,
      },
      errors,
    },

    createLoose: {
      input: emptyInput,
      output: {
        type: "object",
        properties: { sessionID: { type: "string" }, title: { type: "string" } },
        required: ["sessionID", "title"],
        additionalProperties: false,
      },
    },
  },
  events: {},
})
