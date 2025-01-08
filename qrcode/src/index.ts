// Importing modules
import { read } from 'jimp';
const fs = require('fs');
const path = require('path');
const qrCodeReader = require('qrcode-reader');

const imagesDir = 'images';
console.log('📂 Buscando imágenes en:', imagesDir);

// Check if directory exists
if (!fs.existsSync(imagesDir)) {
    console.error('❌ La carpeta no existe:', imagesDir);
    process.exit(1);
}

// Get all files from images directory
const files = fs.readdirSync(imagesDir);
console.log('📁 Archivos encontrados:', files.length);

// Process each file
files.forEach((file) => {
    const imagePath = path.join(imagesDir, file);
    console.log('\n🔍 Procesando:', file);

    // Read the image and create a buffer
    const buffer = fs.readFileSync(imagePath);
    console.log('📊 Tamaño del buffer:', buffer.length, 'bytes');
    
    // Parse the image using read()
    read(buffer, function(err, image) {
        if (err) {
            console.error('❌ Error al leer la imagen:', err);
            return;
        }
        console.log('📐 Dimensiones:', image.bitmap.width, 'x', image.bitmap.height);

        // Creating an instance of qrcode-reader
        const qrCodeInstance = new qrCodeReader();

        qrCodeInstance.callback = function(err, value) {
            if (err) {
                console.error('❌ Error al decodificar QR:', err);
                return;
            }
            // Printing the decrypted value
            console.log('✅ QR detectado en', file + ':', value.result);
        };

        // Decoding the QR code
        qrCodeInstance.decode(image.bitmap);
    });
});