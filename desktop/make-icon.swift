import AppKit

let destination = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
for size in [16, 32, 64, 128, 256, 512, 1024] {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let scale = CGFloat(size) / 1024
    let bounds = NSRect(x: 0, y: 0, width: size, height: size)
    NSColor(calibratedRed: 0.067, green: 0.075, blue: 0.055, alpha: 1).setFill()
    NSBezierPath(roundedRect: bounds.insetBy(dx: 20 * scale, dy: 20 * scale), xRadius: 220 * scale, yRadius: 220 * scale).fill()
    NSColor(calibratedRed: 0.82, green: 0.93, blue: 0.44, alpha: 1).setFill()
    let tile = NSRect(x: 110 * scale, y: 148 * scale, width: 804 * scale, height: 728 * scale)
    NSBezierPath(roundedRect: tile, xRadius: 150 * scale, yRadius: 150 * scale).fill()
    let font = NSFont.systemFont(ofSize: 530 * scale, weight: .heavy)
    let text = "uh" as NSString
    let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(calibratedRed: 0.10, green: 0.14, blue: 0.07, alpha: 1), .kern: -40 * scale]
    let textSize = text.size(withAttributes: attributes)
    text.draw(at: NSPoint(x: (CGFloat(size) - textSize.width) / 2, y: (CGFloat(size) - textSize.height) / 2 + 12 * scale), withAttributes: attributes)
    NSGraphicsContext.restoreGraphicsState()
    let data = bitmap.representation(using: .png, properties: [:])!
    for (points, multiplier) in [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)] where points * multiplier == size {
        let suffix = multiplier == 2 ? "@2x" : ""
        try data.write(to: destination.appendingPathComponent("icon_\(points)x\(points)\(suffix).png"))
    }
}
