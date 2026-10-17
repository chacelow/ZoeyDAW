import {
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs"
import path from "node:path"
import { isWithinBuildPath } from "../git.mjs"

const backupSuffix = ".gpuix-relative-link"

function entryAt(filename) {
  try {
    return lstatSync(filename)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    return undefined
  }
}

export function findDependencyJunctionRepairs(vendor) {
  vendor = realpathSync(vendor)
  const repairs = new Map()
  const withinVendor = filename => {
    if (!isWithinBuildPath(filename, vendor)) {
      throw new Error(`Dependency link escapes the vendor checkout: ${filename}`)
    }
    return filename
  }
  const directoryAt = filename => {
    const entry = entryAt(filename)
    if (!entry) return false
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error(`Expected a physical dependency directory: ${filename}`)
    }
    withinVendor(realpathSync(filename))
    return true
  }
  const directoryTarget = link => {
    const raw = readlinkSync(link)
    const target = realpathSync(path.resolve(path.dirname(link), raw))
    if (!statSync(target).isDirectory()) return undefined
    return withinVendor(target)
  }
  const visit = directory => {
    const entries = readdirSync(directory, { withFileTypes: true })
    for (const entry of entries.filter(item => item.name.endsWith(backupSuffix))) {
      const backup = path.join(directory, entry.name)
      if (!entry.isSymbolicLink() || path.isAbsolute(readlinkSync(backup))) {
        throw new Error(`Refusing an unexpected dependency link backup: ${backup}`)
      }
      const target = directoryTarget(backup)
      if (!target) throw new Error(`Expected a directory link backup: ${backup}`)
      const link = backup.slice(0, -backupSuffix.length)
      const current = entryAt(link)
      if (current && (!current.isSymbolicLink() || directoryTarget(link) !== target)) {
        throw new Error(`Dependency link differs from its interrupted repair: ${link}`)
      }
      repairs.set(link, {
        link,
        target,
        backup,
        replace: !current || !path.isAbsolute(readlinkSync(link)),
      })
    }
    for (const entry of entries) {
      if (entry.name.endsWith(backupSuffix)) continue
      const filename = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        if (repairs.has(filename) || path.isAbsolute(readlinkSync(filename))) continue
        const target = directoryTarget(filename)
        if (target) repairs.set(filename, { link: filename, target, replace: true })
      } else if (entry.isDirectory()) {
        visit(filename)
      }
    }
  }
  const roots = [path.join(vendor, "node_modules")]
  const { workspaces } = JSON.parse(readFileSync(path.join(vendor, "package.json"), "utf8"))
  for (const workspace of workspaces ?? []) {
    const wildcard = workspace.endsWith("/*")
    const base = withinVendor(path.resolve(vendor, wildcard ? workspace.slice(0, -2) : workspace))
    if (workspace.replace(/\/\*$/, "").includes("*")) {
      throw new Error(`Unsupported vendor workspace pattern: ${workspace}`)
    }
    if (!directoryAt(base)) continue
    if (wildcard) {
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory()) roots.push(path.join(base, entry.name, "node_modules"))
      }
    } else {
      roots.push(path.join(base, "node_modules"))
    }
  }
  for (const directory of new Set(roots)) {
    if (directoryAt(directory)) visit(directory)
  }
  return [...repairs.values()]
}

export function repairDependencyJunctions(vendor) {
  const repairs = findDependencyJunctionRepairs(vendor)
  for (const { link, target, backup, replace } of repairs) {
    const saved = backup ?? `${link}${backupSuffix}`
    if (!backup) renameSync(link, saved)
    else if (replace && entryAt(link)) unlinkSync(link)
    if (replace) symlinkSync(target, link, "junction")
    unlinkSync(saved)
  }
  return repairs.length
}
