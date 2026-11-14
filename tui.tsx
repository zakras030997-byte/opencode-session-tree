// TUI-часть local.session-tree (v0.6).
// Левые клики — на mouseDown (мгновенно, не теряются), правый — одиночный mouseUp.
// Контекстное меню действует напрямую на тред/проект, по которому кликнули.
import { Plugin } from "@opencode/plugin/tui"
import { createSignal, For, Show } from "solid-js"
import { TreeRpc } from "./rpc"

type ThreadDto = { folder: string; slug: string; sessionID: string | null; title: string }
type ProjectDto = { name: string; path: string; threads: ThreadDto[] }
type LooseDto = { sessionID: string; title: string; directory: string }
type Tree = { projectsRoot: string; projects: ProjectDto[]; loose: LooseDto[] }

const EMPTY: Tree = { projectsRoot: "", projects: [], loose: [] }
const isRightClick = (e: unknown) => (e as { button?: number } | undefined)?.button === 2

export default Plugin.define({
  id: "local.session-tree",
  async setup(context) {
    const [getTree, setTree] = createSignal<Tree>(EMPTY)
    const [getExpanded, setExpanded] = createSignal<Set<string>>(new Set())
    let rerenderFn: (() => void) | null = null
    const rpc = () => context.client.rpc(TreeRpc)

    const refresh = async () => {
      try {
        setTree((await rpc().listTree({})) as Tree)
        rerenderFn?.()
      } catch {
        /* сервер недоступен */
      }
    }
    await refresh()

    let last = 0
    const stopListen = context.data.listen((event: unknown) => {
      const type =
        (event as { details?: { type?: string }; type?: string })?.details?.type ??
        (event as { type?: string })?.type ??
        ""
      if (typeof type === "string" && type.includes("session") && Date.now() - last > 1000) {
        last = Date.now()
        void refresh()
      }
    })

    const openSession = (sessionID: string) => {
      void context.ui.router.navigate({ type: "session", sessionID })
    }
    const toastOk = (message: string) =>
      context.ui.toast.show({ title: "session-tree", message, variant: "success" })
    const toastError = (e: unknown) =>
      context.ui.toast.show({
        title: "session-tree",
        message: e instanceof Error ? e.message : String(e),
        variant: "error",
      })

    const toggleExpanded = (name: string) => {
      const next = new Set(getExpanded())
      if (next.has(name)) next.delete(name)
      else next.add(name)
      setExpanded(next)
      rerenderFn?.()
    }

    // --- Диалог выбора треда (только для вызова из палитры) --------------

    const pickThread = async () => {
      const t = getTree()
      const options = [
        ...t.projects.flatMap((p) =>
          p.threads
            .filter((th) => th.sessionID)
            .map((th) => ({
              title: th.title,
              value: `${p.path}\n${th.folder}\n${th.sessionID}`,
              category: p.name,
              description: th.folder,
            })),
        ),
        ...t.loose.map((s) => ({
          title: s.title,
          value: `\n\n${s.sessionID}`,
          category: "Без проекта",
        })),
      ]
      if (options.length === 0) {
        context.ui.toast.show({ title: "session-tree", message: "Нет тредов", variant: "info" })
        return null
      }
      return context.ui.dialog.select({ title: "Треды", options })
    }

    const parsePick = (v: string) => {
      const [projectPath, folder, sessionID] = v.split("\n")
      return { projectPath, folder, sessionID }
    }

    const pickProject = async () => {
      const projects = getTree().projects
      if (projects.length === 0) {
        context.ui.toast.show({ title: "session-tree", message: "Нет проектов", variant: "info" })
        return null
      }
      return context.ui.dialog.select({
        title: "Проекты",
        options: projects.map((p) => ({ title: p.name, value: p.path, description: p.path })),
      })
    }

    // --- Прямые действия над конкретной сущностью (без переспрашивания) --

    const newProject = async () => {
      const name = await context.ui.dialog.prompt({ title: "Новый проект", placeholder: "имя-проекта" })
      if (!name?.trim()) return
      try {
        await rpc().createProject({ name: name.trim() })
        await refresh()
        toastOk(`Проект создан: ${name.trim()}`)
      } catch (e) {
        toastError(e)
      }
    }

    const newThreadIn = async (projectPath: string) => {
      const name = await context.ui.dialog.prompt({ title: "Название треда", placeholder: "например: auth-refactor" })
      if (!name?.trim()) return
      try {
        const res = await rpc().createThread({ projectPath, title: name.trim() })
        await refresh()
        openSession(res.sessionID)
        toastOk(`Создан тред: ${res.folder}`)
      } catch (e) {
        toastError(e)
      }
    }

    const newThread = async () => {
      const t = getTree()
      const options = [
        ...t.projects.map((p) => ({ title: p.name, value: p.path, category: "Проекты" })),
        { title: "Без проекта (текущая папка)", value: "\u0000loose", category: "Прочее" },
      ]
      const picked = await context.ui.dialog.select({ title: "Новый тред — где?", options })
      if (!picked) return
      if (picked === "\u0000loose") {
        try {
          const res = await rpc().createLoose({})
          openSession(res.sessionID)
        } catch (e) {
          toastError(e)
        }
        return
      }
      await newThreadIn(picked)
    }

    const openThreadCmd = async () => {
      const picked = await pickThread()
      if (picked) openSession(parsePick(picked).sessionID)
    }

    // Переименовать конкретный тред
    const renameThreadDirect = async (sessionID: string) => {
      const title = await context.ui.dialog.prompt({ title: "Переименовать тред", placeholder: "Новое имя" })
      if (!title?.trim()) return
      try {
        await rpc().renameThread({ sessionID, title: title.trim() })
        await refresh()
        toastOk("Тред переименован")
      } catch (e) {
        toastError(e)
      }
    }

    // Удалить конкретный тред
    const deleteThreadDirect = async (target: { projectPath?: string; folder?: string; sessionID: string }) => {
      const isProjectThread = !!target.projectPath && !!target.folder
      const confirmed = await context.ui.dialog.confirm({
        title: "Удалить тред?",
        message: isProjectThread
          ? `Сессия и папка будут удалены безвозвратно:\n${target.folder}`
          : `Сессия будет удалена безвозвратно:\n${target.sessionID}`,
        label: { confirm: "Удалить", cancel: "Отмена" },
      })
      if (!confirmed) return
      try {
        if (isProjectThread) {
          const res = await rpc().deleteThread({
            projectPath: target.projectPath!,
            folder: target.folder!,
            sessionID: target.sessionID,
          })
          await refresh()
          toastOk(res.removedFolder ? "Тред и папка удалены" : "Удалена только сессия")
        } else {
          await rpc().deleteSession({ sessionID: target.sessionID })
          await refresh()
          toastOk("Сессия удалена")
        }
      } catch (e) {
        toastError(e)
      }
    }

    // Переименовать конкретный проект
    const renameProjectDirect = async (projectPath: string) => {
      const project = getTree().projects.find((p) => p.path === projectPath)
      const name = await context.ui.dialog.prompt({
        title: "Переименовать проект",
        placeholder: project?.name ?? "новое-имя",
      })
      if (!name?.trim()) return
      try {
        await rpc().renameProject({ path: projectPath, name: name.trim() })
        await refresh()
        toastOk("Проект переименован")
      } catch (e) {
        toastError(e)
      }
    }

    // Удалить конкретный проект
    const deleteProjectDirect = async (projectPath: string) => {
      const project = getTree().projects.find((p) => p.path === projectPath)
      const total = project?.threads.length ?? 0
      const confirmed = await context.ui.dialog.confirm({
        title: "Удалить проект?",
        message: `Будут безвозвратно удалены:\n${projectPath}\n${total} тред(ов), их сессии, история и файлы.`,
        label: { confirm: "Удалить всё", cancel: "Отмена" },
      })
      if (!confirmed) return
      try {
        const res = await rpc().deleteProject({ path: projectPath })
        await refresh()
        toastOk(`Проект удалён: сессий ${res.removedSessions}, папка ${res.removedFolder ? "удалена" : "осталась"}`)
      } catch (e) {
        toastError(e)
      }
    }

    const refreshCmd = async () => {
      await refresh()
      context.ui.toast.show({ title: "session-tree", message: "Дерево обновлено", variant: "info" })
    }

    const copyIdCmd = async (id: string) => {
      // Буфера обмена в plugin API нет — показываем ID, его можно выделить и скопировать.
      await context.ui.dialog.alert({ title: "Session ID", message: id })
    }

    // --- Обёртки для палитры (там выбор треда уместен) --------------------

    const renameThreadCmd = async () => {
      const picked = await pickThread()
      if (picked) await renameThreadDirect(parsePick(picked).sessionID)
    }
    const deleteThreadCmd = async () => {
      const picked = await pickThread()
      if (picked) {
        const { projectPath, folder, sessionID } = parsePick(picked)
        await deleteThreadDirect({ projectPath, folder, sessionID })
      }
    }
    const renameProjectCmd = async () => {
      const target = await pickProject()
      if (target) await renameProjectDirect(target)
    }
    const deleteProjectCmd = async () => {
      const target = await pickProject()
      if (target) await deleteProjectDirect(target)
    }

    // --- Меню по правому клику: работают с конкретной сущностью ----------

    const projectMenu = async (project: ProjectDto) => {
      const action = await context.ui.dialog.select({
        title: project.name,
        options: [
          { title: "Новый тред", value: "new", description: "threads/<имя>/ + сессия" },
          { title: "Переименовать проект", value: "rename" },
          { title: "Удалить проект (полная зачистка)", value: "delete" },
        ],
      })
      if (action === "new") await newThreadIn(project.path)
      else if (action === "rename") await renameProjectDirect(project.path)
      else if (action === "delete") await deleteProjectDirect(project.path)
    }

    const threadMenu = async (projectPath: string, th: ThreadDto) => {
      if (!th.sessionID) return
      const action = await context.ui.dialog.select({
        title: th.title,
        options: [
          { title: "Открыть", value: "open" },
          { title: "Переименовать", value: "rename" },
          { title: "Копировать ID", value: "copy" },
          { title: "Удалить", value: "delete" },
        ],
      })
      if (action === "open") openSession(th.sessionID)
      else if (action === "rename") await renameThreadDirect(th.sessionID)
      else if (action === "copy") await copyIdCmd(th.sessionID)
      else if (action === "delete") await deleteThreadDirect({ projectPath, folder: th.folder, sessionID: th.sessionID })
    }

    const looseMenu = async (s: LooseDto) => {
      const action = await context.ui.dialog.select({
        title: s.title,
        options: [
          { title: "Открыть", value: "open" },
          { title: "Переименовать", value: "rename" },
          { title: "Копировать ID", value: "copy" },
          { title: "Удалить", value: "delete" },
        ],
      })
      if (action === "open") openSession(s.sessionID)
      else if (action === "rename") await renameThreadDirect(s.sessionID)
      else if (action === "copy") await copyIdCmd(s.sessionID)
      else if (action === "delete") await deleteThreadDirect({ sessionID: s.sessionID })
    }

    // --- Клавиатурный паритет (палитра + слэш) ---------------------------

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        { id: "session-tree.open", title: "Дерево: открыть тред", slash: { name: "tree" }, palette: true, run: openThreadCmd },
        { id: "session-tree.new", title: "Дерево: новый тред", slash: { name: "tree-new" }, palette: true, run: newThread },
        { id: "session-tree.new-project", title: "Дерево: новый проект", slash: { name: "tree-project-new" }, palette: true, run: newProject },
        { id: "session-tree.rename", title: "Дерево: переименовать тред", palette: true, run: renameThreadCmd },
        { id: "session-tree.delete", title: "Дерево: удалить тред", palette: true, run: deleteThreadCmd },
        { id: "session-tree.rename-project", title: "Дерево: переименовать проект", palette: true, run: renameProjectCmd },
        { id: "session-tree.delete-project", title: "Дерево: удалить проект", palette: true, run: deleteProjectCmd },
        { id: "session-tree.refresh", title: "Дерево: обновить", palette: true, run: refreshCmd },
      ],
      bindings: [],
    }))

    // --- Рендер ----------------------------------------------------------
    // Левые клики — onMouseDown (мгновенно; надёжнее, чем mouseUp после выделения текста).
    // Правый клик — onMouseUp, одиночное нажатие. Диалоговые элементы — onMouseUp.

    const muted = (context.theme as { text?: { muted?: string } }).text?.muted ?? context.theme.text.base
    const HEADER = "ПРОЕКТЫ"

    const renderTree = (t: Tree) => (
      <box flexDirection="column" marginTop={1}>
        <box flexDirection="row" width="100%" justifyContent="center" onMouseUp={() => void newProject()}>
          <text fg="yellow" attributes={{ bold: true }}>{`─ ${HEADER} ─`}</text>
        </box>
        <Show when={t.projects.length > 0} fallback={<text fg={muted}>  Нет проектов — «+» или /tree-project-new</text>}>
          <For each={t.projects}>
            {(project) => (
              <box flexDirection="column">
                <box flexDirection="row">
                  <text
                    fg={context.theme.text.base}
                    onMouseDown={(e: unknown) => {
                      if (isRightClick(e)) return
                      toggleExpanded(project.name)
                    }}
                    onMouseUp={(e: unknown) => {
                      if (isRightClick(e)) void projectMenu(project)
                    }}
                  >
                    {`${getExpanded().has(project.name) ? "▾" : "▸"} ${project.name} · ${project.threads.length} `}
                  </text>
                  <box
                    onMouseUp={() => void newThreadIn(project.path)}
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <text fg="yellow">+</text>
                  </box>
                </box>
                <Show when={getExpanded().has(project.name)}>
                  <For each={project.threads}>
                    {(th) => (
                      <text
                        fg={th.sessionID ? context.theme.text.base : muted}
                        onMouseDown={(e: unknown) => {
                          if (isRightClick(e) || !th.sessionID) return
                          openSession(th.sessionID)
                        }}
                        onMouseUp={(e: unknown) => {
                          if (isRightClick(e)) void threadMenu(project.path, th)
                        }}
                      >
                        {`    · ${th.title}`}
                      </text>
                    )}
                  </For>
                </Show>
              </box>
            )}
          </For>
        </Show>
        <Show when={t.loose.length > 0}>
          <box flexDirection="column" marginTop={1}>
            <text fg={muted}>{`БЕЗ ПРОЕКТА ${t.loose.length}`}</text>
            <For each={t.loose}>
              {(s) => (
                <text
                  fg={context.theme.text.base}
                  onMouseDown={(e: unknown) => {
                    if (isRightClick(e)) return
                    openSession(s.sessionID)
                  }}
                  onMouseUp={(e: unknown) => {
                    if (isRightClick(e)) void looseMenu(s)
                  }}
                >
                  {`  · ${s.title}`}
                </text>
              )}
            </For>
          </box>
        </Show>
      </box>
    )

    let slotReg: (() => void) | null = null
    rerenderFn = () => {
      slotReg?.()
      const snapshot = getTree()
      slotReg = context.ui.slot({
        append: "sidebar.content",
        render: () => renderTree(snapshot),
      })
    }

    rerenderFn()

    return () => {
      stopListen()
      slotReg?.()
    }
  },
})
