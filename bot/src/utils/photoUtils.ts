import { MyContext } from "../types/session";
import { PhotoRegistration } from "../types/types";
import { analyzeImage } from "../services/imageAnalysis";
import https from 'https';

// Crear un agente HTTPS personalizado con timeouts más largos
const agent = new https.Agent({
    keepAlive: true,
    timeout: 30000,  // 30 segundos
    rejectUnauthorized: false
});

export async function getPhotoUrl(ctx: MyContext, fileId: string, retries = 3): Promise<string> {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            const file = await ctx.api.getFile(fileId);
            if (!file.file_path) throw new Error('No file path received');
            return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        } catch (error) {
            console.log(`Intento ${i + 1} fallido para obtener URL de foto ${fileId}:`, error);
            lastError = error;
            if (i < retries - 1) {
                const delay = 5000 * Math.pow(2, i); // Espera exponencial: 5s, 10s, 20s...
                console.log(`Esperando ${delay}ms antes del siguiente intento...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError || new Error('Failed to get photo URL after retries');
}

export async function analyzePhotosInBatches(
    ctx: MyContext,
    photos: PhotoRegistration[],
    batchSize = 1
): Promise<Array<{ photo: PhotoRegistration; analysis: any; analysisTime: number }>> {
    const results = [];
    console.log(`🔄 Iniciando análisis en lotes de ${batchSize} fotos...`);

    for (let i = 0; i < photos.length; i += batchSize) {
        const batch = photos.slice(i, i + batchSize);
        console.log(`📸 Procesando lote ${Math.floor(i / batchSize) + 1} de ${Math.ceil(photos.length / batchSize)}`);
        
        for (const photo of batch) {
            try {
                console.log(`📸 [Foto ${i + 1}/${photos.length}] Obteniendo URL...`);
                const photoUrl = await getPhotoUrl(ctx, photo.file_id);
                
                console.log(`📸 [Foto ${i + 1}/${photos.length}] Iniciando análisis...`);
                const startTime = Date.now();
                const analysis = await analyzeImage(photoUrl);
                const endTime = Date.now();
                const analysisTime = endTime - startTime;
                
                console.log(`✅ [Foto ${i + 1}/${photos.length}] Análisis completado en ${analysisTime}ms`);
                results.push({ photo, analysis, analysisTime });
            } catch (error) {
                console.error(`❌ Error procesando foto ${i + 1}:`, error);
                throw error;
            }
        }
        
        // Pausa más larga entre lotes
        if (i + batchSize < photos.length) {
            console.log('⏳ Esperando 3 segundos antes del siguiente lote...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    return results;
} 