// Render the installed Simulator's own vector assets at native display scale.
// These are hardware framing assets, never replacement app pixels.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let scale = Double(CommandLine.arguments[3])!
guard let document = CGPDFDocument(input as CFURL), let page = document.page(at: 1) else {
    fatalError("Cannot read Simulator PDF asset")
}
let box = page.getBoxRect(.mediaBox)
let width = Int((box.width * scale).rounded())
let height = Int((box.height * scale).rounded())
guard let context = CGContext(data: nil, width: width, height: height,
    bitsPerComponent: 8, bytesPerRow: width * 4,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
    fatalError("Cannot create Simulator asset bitmap")
}
context.scaleBy(x: scale, y: scale)
context.translateBy(x: -box.origin.x, y: -box.origin.y)
context.drawPDFPage(page)
guard let image = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    fatalError("Cannot write Simulator asset bitmap")
}
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("Simulator asset write failed") }
print("\(width)x\(height) \(output.lastPathComponent)")