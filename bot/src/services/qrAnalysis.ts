import https from 'https';
import fs from 'fs';
import path from 'path';
import { resolveShortUrl } from '../utils/helpers';
const Jimp = require('jimp');
const qrCodeReader = require('qrcode-reader');

// Crear un agente HTTPS personalizado con timeouts más largos
const agent = new https.Agent({
    keepAlive: true,
    timeout: 60000, // 60 segundos
    rejectUnauthorized: false
});

async function downloadImage(url: string, retries = 3): Promise<Buffer> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`📥 Intento ${attempt}/${retries} de descarga...`);
            return await new Promise((resolve, reject) => {
                const request = https.get(url, { agent }, (response) => {
                    const chunks: Uint8Array[] = [];
                    response.on('data', (chunk) => chunks.push(chunk));
                    response.on('end', () => resolve(Buffer.concat(chunks)));
                    response.on('error', reject);
                });
                
                request.setTimeout(60000); // 60 segundos
                request.on('timeout', () => {
                    request.destroy();
                    reject(new Error('Timeout en la descarga'));
                });
                
                request.on('error', reject);
            });
        } catch (error) {
            if (attempt === retries) throw error;
            console.log(`❌ Intento ${attempt} falló, reintentando en 2 segundos...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    throw new Error('No se pudo descargar la imagen después de todos los intentos');
}

export const analyzeQR = async (imageUrl: string): Promise<string | undefined> => {
    try {
        console.log('\n🔍 Iniciando análisis de QR...');
        
        // Descargar imagen
        console.log('📥 Descargando imagen de:', imageUrl);
        const buffer = await downloadImage(imageUrl);
        console.log(`📦 Imagen descargada: ${buffer.length} bytes`);

        // Crear una Promise para manejar el callback de qrcode-reader
        const qrResult = await new Promise<string | undefined>((resolve, reject) => {
            // Parse the image using Jimp.read()
            Jimp.read(buffer, function(err: Error, image: any) {
                if (err) {
                    console.error('❌ Error al leer la imagen:', err);
                    resolve(undefined);
                    return;
                }

                console.log(`📊 Dimensiones: ${image.bitmap.width}x${image.bitmap.height}`);

                // Creating an instance of qrcode-reader
                const qrCodeInstance = new qrCodeReader();

                qrCodeInstance.callback = function(err: Error, value: any) {
                    if (err) {
                        console.error('❌ Error al decodificar:', err);
                        resolve(undefined);
                        return;
                    }
                    // Printing the decrypted value
                    console.log('✅ QR detectado:', value?.result);
                    resolve(value?.result);
                };

                // Decoding the QR code
                qrCodeInstance.decode(image.bitmap);
            });
        });

        // Si el QR contiene una URL, procesarla
        if (qrResult && typeof qrResult === 'string') {
            try {
                // Limpiar la URL de espacios y caracteres no deseados
                const cleanQR = qrResult.trim().replace(/[\n\r\t]/g, '');
                
                // Intentar construir una URL válida
                let urlToResolve: string;
                try {
                    // Si parece una URL, intentar parsearla
                    if (cleanQR.includes('.') && !cleanQR.includes(' ')) {
                        urlToResolve = cleanQR.startsWith('http') ? cleanQR : `https://${cleanQR}`;
                        new URL(urlToResolve); // Validar formato
                    } else {
                        return cleanQR; // Si no parece URL, devolver el texto limpio
                    }
                } catch {
                    return cleanQR; // Si no es URL válida, devolver el texto limpio
                }

                // Si es una URL corta conocida, resolverla
                if (urlToResolve.match(/eqrco\.de|bit\.ly|goo\.gl|tinyurl\.com/i)) {
                    console.log('🔍 Detectada URL corta, resolviendo...');
                    const resolvedUrl = await resolveShortUrl(urlToResolve);
                    console.log('✅ QR resuelto a:', resolvedUrl);
                    return resolvedUrl;
                }

                return urlToResolve;
            } catch (error) {
                console.log('⚠️ Error procesando URL del QR:', error);
                return qrResult; // Devolver el contenido original si hay error
            }
        }

        return qrResult;
    } catch (error) {
        console.error('❌ Error en análisis QR:', error);
        return undefined;
    }
}; 