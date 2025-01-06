import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface ImageAnalysisResult {
    success: boolean;
    name?: string;
    confidence?: number;
    error?: {
        code: string;
        message: string;
    };
}

const TIMEOUT = 30000; // 30 segundos

export async function analyzeImage(imageUrl: string): Promise<ImageAnalysisResult> {
    try {
        // Si no hay API key configurada, devolver error amigable
        if (!process.env.XAI_API_KEY) {
            return {
                success: false,
                error: {
                    code: 'NO_API_KEY',
                    message: 'API key no configurada'
                }
            };
        }

        // Configurar AbortController para el timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

        try {
            // Primero, intentamos descargar la imagen
            const imageResponse = await fetch(imageUrl, { 
                signal: controller.signal
            });
            if (!imageResponse.ok) {
                return {
                    success: false,
                    error: {
                        code: 'IMAGE_DOWNLOAD_ERROR',
                        message: 'No se pudo descargar la imagen'
                    }
                };
            }

            // Convertir la imagen a base64
            const imageBuffer = await imageResponse.arrayBuffer();
            const base64Image = Buffer.from(imageBuffer).toString('base64');

            const response = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.XAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "grok-1",
                    messages: [
                        {
                            role: "system",
                            content: "Eres un asistente especializado en detectar nombres de inmobiliarias en imágenes. Debes responder en formato JSON con la siguiente estructura: {\"success\": boolean, \"name\": string | null, \"confidence\": number | null}. La confianza debe ser un número entre 0 y 1."
                        },
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: "Analiza esta imagen y devuelve un JSON con el nombre de la inmobiliaria si lo encuentras. Si no encuentras ningún nombre, devuelve success: false."
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
                    max_tokens: 150,
                    temperature: 0
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error response:', errorText);
                
                // Si el error es de permisos o tokens, devolver un error específico
                if (response.status === 403 || errorText.includes('permission') || errorText.includes('token')) {
                    return {
                        success: false,
                        error: {
                            code: 'API_PERMISSION_ERROR',
                            message: 'Error de permisos o tokens en la API'
                        }
                    };
                }

                return {
                    success: false,
                    error: {
                        code: 'API_ERROR',
                        message: `Error en la API: ${response.statusText}`
                    }
                };
            }

            const data = await response.json();
            const result = data.choices[0]?.message?.content?.trim();

            try {
                // Intentar parsear la respuesta como JSON
                const parsedResult = JSON.parse(result);
                return {
                    success: parsedResult.success,
                    name: parsedResult.name,
                    confidence: parsedResult.confidence
                };
            } catch (e) {
                console.error('Error parsing JSON response:', e);
                return {
                    success: false,
                    error: {
                        code: 'PARSE_ERROR',
                        message: 'Error al procesar la respuesta de la API'
                    }
                };
            }
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error) {
        console.error('Error analyzing image:', error);
        return {
            success: false,
            error: {
                code: 'UNKNOWN_ERROR',
                message: 'Error desconocido al analizar la imagen'
            }
        };
    }
} 