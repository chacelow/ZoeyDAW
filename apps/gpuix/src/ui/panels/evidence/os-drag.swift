import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

// Test driver only: posts real OS events to the explicitly named gallery process.
let arguments = CommandLine.arguments
precondition(arguments.count == 7, "Usage: swift os-drag.swift PID X Y DX DY drag|escape|windowblur|reverse")
guard let pid = Int32(arguments[1]), let x = Double(arguments[2]), let y = Double(arguments[3]),
      let dx = Double(arguments[4]), let dy = Double(arguments[5]),
      let app = NSRunningApplication(processIdentifier: pid) else { fatalError("Invalid target") }
let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
precondition(windows.contains { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowName as String] as? String) == "gpuix panel gallery A4" }, "Target is not the A4 gallery")
let source = CGEventSource(stateID: .hidSystemState)
let original = CGEvent(source: source)?.location
func mouse(_ type: CGEventType, _ point: CGPoint) {
    CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.04)
}
func key(_ code: CGKeyCode) {
    CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true)?.postToPid(pid)
    CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false)?.postToPid(pid)
    Thread.sleep(forTimeInterval: 0.1)
}
func status(_ element: AXUIElement, _ depth: Int = 0) -> String? {
    if depth > 15 { return nil }
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &value)
    if let text = value as? String, text.contains("px · Clip") { return text }
    var children: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &children)
    for child in children as? [AXUIElement] ?? [] {
        if let found = status(child, depth + 1) { return found }
    }
    return nil
}
let accessibility = AXUIElementCreateApplication(pid)
print("Before: \(status(accessibility) ?? "status unavailable")")
app.activate(options: [])
AXUIElementSetAttributeValue(accessibility, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
var windowList: CFTypeRef?
AXUIElementCopyAttributeValue(accessibility, kAXWindowsAttribute as CFString, &windowList)
if let window = (windowList as? [AXUIElement])?.first { AXUIElementPerformAction(window, kAXRaiseAction as CFString) }
Thread.sleep(forTimeInterval: 0.2)
mouse(.mouseMoved, CGPoint(x: x, y: y))
mouse(.leftMouseDown, CGPoint(x: x, y: y))
for step in 1...10 {
    mouse(.leftMouseDragged, CGPoint(x: x + dx * Double(step) / 10, y: y + dy * Double(step) / 10))
}
print("Preview: \(status(accessibility) ?? "status unavailable")")
var end = CGPoint(x: x + dx, y: y + dy)
switch arguments[6] {
case "escape": key(53)
case "windowblur":
    NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder").first?.activate(options: [])
    Thread.sleep(forTimeInterval: 0.2)
case "reverse":
    end = CGPoint(x: x + dx * 0.25, y: y + dy * 0.25)
    mouse(.leftMouseDragged, end)
case "drag": break
default: fatalError("Unknown gesture")
}
mouse(.leftMouseUp, end)
print("After: \(status(accessibility) ?? "status unavailable")")
if let original { mouse(.mouseMoved, original) }
print("OS gesture posted: \(arguments[6]) delta=(\(dx),\(dy)) target=\(pid)")
