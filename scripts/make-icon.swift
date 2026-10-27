// Generate quarry's app icon on Apple's macOS grid.
//
//   swift scripts/make-icon.swift /tmp/quarry.iconset
//   iconutil -c icns /tmp/quarry.iconset -o src-tauri/icons/icon.icns
//
// The grid is the whole point: macOS expects the rounded square to occupy 824 of a 1024 canvas and
// leave the rest transparent. Art that fills the canvas renders oversized in the Dock beside every
// other app, and an icon drawn at 512 is soft on a Retina display. Re-run this instead of hand
// editing the PNGs, then copy icon_32x32.png, icon_128x128.png, icon_128x128@2x.png and
// icon_512x512@2x.png over 32x32.png, 128x128.png, 128x128@2x.png and icon.png.

import AppKit
import Foundation

let canvas: CGFloat = 1024
let inset: CGFloat = 100
let side = canvas - inset * 2
let radius: CGFloat = 185

func draw(size: CGFloat, into url: URL) {
	let pixels = Int(size)
	guard
		let rep = NSBitmapImageRep(
			bitmapDataPlanes: nil,
			pixelsWide: pixels,
			pixelsHigh: pixels,
			bitsPerSample: 8,
			samplesPerPixel: 4,
			hasAlpha: true,
			isPlanar: false,
			colorSpaceName: .deviceRGB,
			bytesPerRow: 0,
			bitsPerPixel: 0
		)
	else {
		fatalError("cannot allocate \(pixels)px bitmap")
	}
	rep.size = NSSize(width: size, height: size)

	guard let context = NSGraphicsContext(bitmapImageRep: rep) else {
		fatalError("cannot make a graphics context")
	}
	NSGraphicsContext.saveGraphicsState()
	NSGraphicsContext.current = context

	let scale = size / canvas
	context.cgContext.scaleBy(x: scale, y: scale)

	let plate = NSBezierPath(
		roundedRect: NSRect(x: inset, y: inset, width: side, height: side),
		xRadius: radius,
		yRadius: radius
	)
	NSColor(srgbRed: 0.067, green: 0.075, blue: 0.086, alpha: 1).setFill()
	plate.fill()

	let ring = NSBezierPath()
	ring.appendOval(in: NSRect(x: 512 - 329, y: 512 - 329, width: 658, height: 658))
	ring.lineWidth = 128
	NSColor(srgbRed: 0.416, green: 0.62, blue: 1, alpha: 1).setStroke()
	ring.stroke()

	let tail = NSBezierPath(
		roundedRect: NSRect(x: 0, y: 0, width: 420, height: 64),
		xRadius: 32,
		yRadius: 32
	)
	var transform = AffineTransform(translationByX: 505, byY: 565)
	transform.rotate(byDegrees: -42)
	tail.transform(using: transform)
	NSColor(srgbRed: 0.85, green: 0.86, blue: 0.88, alpha: 1).setFill()
	tail.fill()

	NSGraphicsContext.restoreGraphicsState()

	guard let data = rep.representation(using: .png, properties: [:]) else {
		fatalError("cannot encode \(pixels)px png")
	}
	try! data.write(to: url)
}

let output = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "quarry.iconset"
let directory = URL(fileURLWithPath: output)
try! FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

let sizes: [(String, CGFloat)] = [
	("icon_16x16.png", 16),
	("icon_16x16@2x.png", 32),
	("icon_32x32.png", 32),
	("icon_32x32@2x.png", 64),
	("icon_128x128.png", 128),
	("icon_128x128@2x.png", 256),
	("icon_256x256.png", 256),
	("icon_256x256@2x.png", 512),
	("icon_512x512.png", 512),
	("icon_512x512@2x.png", 1024),
]

for (name, size) in sizes {
	draw(size: size, into: directory.appendingPathComponent(name))
}
print("wrote \(sizes.count) images to \(directory.path)")
