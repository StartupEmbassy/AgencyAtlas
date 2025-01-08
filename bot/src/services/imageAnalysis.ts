import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { IMAGE_ANALYSIS_PROMPT } from "../prompts/imageAnalysis";
import { analyzeQR } from './qrAnalysis';
import { ImageAnalysis } from '../types/types';

// Configurar clientes
if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY debe estar definida en las variables de entorno');
}
if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY debe estar definida en las variables de entorno');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq();

interface ImageAnalysisResult {
    name?: string;
    qr_data?: string;
    web_url?: string;
    validation_score?: number;
    validation_reasons?: string[];
    condition_score?: number;
    image_quality?: any;
    objects_detected?: string[];
    phone_numbers?: string[];
    emails?: string[];
    business_hours?: string;
    confidence?: number;
    error?: boolean;
    error_type?: string;
    error_message?: string;
    provider?: 'gemini' | 'groq';
    listing_urls?: string[];
}

export const analyzeWithGemini = async (imageUrl: string): Promise<ImageAnalysisResult> => {
    try {
        // Obtener la imagen
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Error al obtener la imagen: ${imageResponse.statusText}`);
        }
        const imageData = await imageResponse.arrayBuffer();

        // Crear el modelo
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        // Analizar la imagen con reintentos
        let attempts = 0;
        const maxAttempts = 3;
        let lastError;

        while (attempts < maxAttempts) {
            try {
                console.log(`🔄 Intento ${attempts + 1}/${maxAttempts} con Gemini...`);
                
                // Verificar si el error anterior fue de cuota
                if (lastError instanceof Error && lastError.message.includes('429')) {
                    console.log('⚠️ Detectado error de cuota, cambiando a Groq...');
                    throw new Error('QUOTA_EXCEEDED');
                }

                const result = await model.generateContent([
                    {
                        inlineData: {
                            mimeType: "image/jpeg",
                            data: Buffer.from(imageData).toString("base64")
                        }
                    },
                    IMAGE_ANALYSIS_PROMPT
                ]);

                const response = result.response;
                if (!response.text()) {
                    throw new Error("Respuesta vacía de Gemini");
                }

                const jsonMatch = response.text().match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    throw new Error("No se encontró JSON en la respuesta de Gemini");
                }

                const analysis = JSON.parse(jsonMatch[0]);
                return {
                    ...analysis,
                    provider: 'gemini' as const
                };
            } catch (error) {
                lastError = error;
                console.error(`❌ Error en intento ${attempts + 1} con Gemini:`, error);
                attempts++;
                if (attempts < maxAttempts) {
                    const delay = Math.pow(2, attempts) * 1000; // Backoff exponencial
                    console.log(`⏳ Esperando ${delay/1000}s antes del siguiente intento...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;

    } catch (error) {
        console.error('❌ Error fatal en Gemini:', error);
        throw error;
    }
};

export const analyzeWithGroq = async (imageUrl: string): Promise<ImageAnalysisResult> => {
    try {
        console.log('\n🔍 Iniciando análisis de imagen con Groq...');
        
        // Obtener la imagen
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Error al obtener la imagen: ${response.statusText}`);
        }
        const imageBuffer = await response.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');

        // Analizar con reintentos
        let attempts = 0;
        const maxAttempts = 3;
        let lastError;

        while (attempts < maxAttempts) {
            try {
                console.log(`🔄 Intento ${attempts + 1}/${maxAttempts} con Groq...`);
                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: IMAGE_ANALYSIS_PROMPT
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: `data:image/jpeg;base64,${base64Image}`
                                    }
                                }
                            ]
                        }
                    ],
                    model: "llama-3.2-90b-vision-preview",
                    temperature: 0.5,
                    max_tokens: 1024,
                    stream: false
                });

                const content = chatCompletion.choices[0].message.content || '';
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    throw new Error("No se encontró JSON en la respuesta de Groq");
                }

                const analysis = JSON.parse(jsonMatch[0]);
                return {
                    ...analysis,
                    provider: 'groq' as const
                };
            } catch (error) {
                lastError = error;
                console.error(`❌ Error en intento ${attempts + 1} con Groq:`, error);
                attempts++;
                if (attempts < maxAttempts) {
                    const delay = Math.pow(2, attempts) * 1000; // Backoff exponencial
                    console.log(`⏳ Esperando ${delay/1000}s antes del siguiente intento...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;

    } catch (error) {
        console.error('❌ Error fatal en Groq:', error);
        throw error;
    }
};

export const analyzeImage = async (imageUrl: string): Promise<ImageAnalysis> => {
    try {
        // Primero intentamos con Gemini
        let analysisResult: ImageAnalysisResult;
        try {
            console.log('🤖 Intentando análisis con Gemini...');
            analysisResult = await analyzeWithGemini(imageUrl);
            analysisResult.provider = 'gemini';
        } catch (error: any) {
            // Log detallado del error de Gemini
            const geminiError = error instanceof Error ? error : new Error(String(error));
            console.error('❌ Error en Gemini:', {
                message: geminiError.message,
                stack: geminiError.stack
            });
            
            console.log('⚠️ Intentando con Groq como fallback...');
            try {
                const groqResult = await analyzeWithGroq(imageUrl);
                analysisResult = {
                    ...groqResult,
                    provider: 'groq' as const,
                    error: undefined
                };
            } catch (error: any) {
                const groqError = error instanceof Error ? error : new Error(String(error));
                console.error('❌ Error en Groq:', groqError);
                throw new Error(`Ambos servicios fallaron - Gemini: ${geminiError.message}, Groq: ${groqError.message}`);
            }
        }

        // Analizar QR en paralelo
        let qrData: string | undefined;
        try {
            qrData = await analyzeQR(imageUrl);
            if (qrData) {
                console.log('✅ QR detectado:', qrData);
            }
        } catch (qrError) {
            console.error('❌ Error analizando QR:', qrError);
        }

        // Convertir el resultado a ImageAnalysis
        const analysis: ImageAnalysis = {
            name: analysisResult.name || 'Not visible',
            validation_score: analysisResult.validation_score || 0,
            validation_reasons: analysisResult.validation_reasons,
            condition_score: analysisResult.condition_score,
            image_quality: analysisResult.image_quality,
            objects_detected: analysisResult.objects_detected,
            phone_numbers: analysisResult.phone_numbers,
            emails: analysisResult.emails,
            business_hours: analysisResult.business_hours,
            confidence: analysisResult.confidence,
            is_valid: (analysisResult.validation_score || 0) > 50,
            web_url: analysisResult.web_url,
            qr_data: qrData,
            provider: analysisResult.provider
        };

        return analysis;
    } catch (error) {
        console.error('❌ Error fatal en análisis de imagen:', error);
        return {
            name: 'Error',
            validation_score: 0,
            is_valid: false,
            web_url: undefined,
            qr_data: undefined,
            provider: undefined,
            error: error instanceof Error ? error.message : 'Error desconocido'
        };
    }
}; 