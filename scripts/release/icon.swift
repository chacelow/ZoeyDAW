import AppKit

let arguments = CommandLine.arguments
if arguments.count != 5 {
    fatalError("Usage: swift icon.swift output.png background foreground accent")
}
func color(_ hex: String) -> NSColor {
    guard hex.count == 7, hex.first == "#", let value = UInt32(hex.dropFirst(), radix: 16) else {
        fatalError("Expected an RGB hex color")
    }
    return NSColor(srgbRed: CGFloat((value >> 16) & 255) / 255,
                   green: CGFloat((value >> 8) & 255) / 255,
                   blue: CGFloat(value & 255) / 255, alpha: 1)
}
guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024,
                                  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                  isPlanar: false, colorSpaceName: .deviceRGB,
                                  bytesPerRow: 0, bitsPerPixel: 0),
      let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Could not allocate icon bitmap")
}
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
color(arguments[2]).setFill()
NSBezierPath(roundedRect: NSRect(x: 64, y: 64, width: 896, height: 896), xRadius: 180, yRadius: 180).fill()
color(arguments[4]).setFill()
for (index, height) in [160, 320, 480, 640, 480, 320, 160].enumerated() {
    NSBezierPath(roundedRect: NSRect(x: 220 + index * 88, y: (1024 - height) / 2,
                                   width: 56, height: height), xRadius: 28, yRadius: 28).fill()
}
color(arguments[3]).setFill()
NSBezierPath(roundedRect: NSRect(x: 220, y: 486, width: 584, height: 52), xRadius: 26, yRadius: 26).fill()
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode icon PNG")
}
try png.write(to: URL(fileURLWithPath: arguments[1]))
