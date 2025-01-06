"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeImage = analyzeImage;
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Cargar variables de entorno
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env') });
if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY debe estar definido en las variables de entorno');
}
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY
});
async function analyzeImage(imageUrl) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "¿Puedes ver el nombre de alguna inmobiliaria o agencia en esta imagen? Si lo ves, devuelve solo el nombre. Si no ves ningún nombre claro, responde exactamente 'NO_NAME_FOUND'."
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: imageUrl
                            }
                        }
                    ],
                }
            ],
            max_tokens: 100
        });
        const result = response.choices[0]?.message?.content?.trim();
        if (!result || result === 'NO_NAME_FOUND') {
            return null;
        }
        return result;
    }
    catch (error) {
        console.error('Error analyzing image:', error);
        return null;
    }
}
