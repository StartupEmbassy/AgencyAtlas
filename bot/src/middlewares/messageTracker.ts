import { NextFunction } from "grammy";
import { MyContext } from "../types/session";
import { trackUserMessage, trackBotMessage } from "../services/messageManager";

// Middleware para rastrear automáticamente los IDs de mensajes
export async function messageTrackerMiddleware(ctx: MyContext, next: NextFunction) {
    try {
        // Rastrear mensaje del usuario si existe
        if (ctx.message?.message_id) {
            trackUserMessage(ctx, ctx.message.message_id);
        }

        // Interceptar el método reply para rastrear automáticamente las respuestas del bot
        const originalReply = ctx.reply.bind(ctx);
        ctx.reply = async function(...args: Parameters<typeof originalReply>) {
            const sentMessage = await originalReply(...args);
            if (sentMessage.message_id) {
                trackBotMessage(ctx, sentMessage.message_id);
            }
            return sentMessage;
        };

        await next();
    } catch (error) {
        console.error("Error en messageTrackerMiddleware:", error);
        await next();
    }
} 