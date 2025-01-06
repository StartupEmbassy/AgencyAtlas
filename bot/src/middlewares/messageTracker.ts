import { MyContext } from "../types/session";
import { Middleware } from "grammy";

// Función helper para añadir IDs de mensajes al registro actual
function addMessageToRegistration(ctx: MyContext, messageId: number) {
    if (ctx.session.registration.currentRegistration) {
        if (!ctx.session.registration.currentRegistration.messages_ids) {
            ctx.session.registration.currentRegistration.messages_ids = [];
        }
        ctx.session.registration.currentRegistration.messages_ids.push(messageId);
    }
}

export const messageTrackerMiddleware: Middleware<MyContext> = async (ctx, next) => {
    // Rastrear mensaje del usuario
    if (ctx.message?.message_id) {
        ctx.session.userMessageIds.push(ctx.message.message_id);
        addMessageToRegistration(ctx, ctx.message.message_id);
    }

    // Interceptar el método reply
    const originalReply = ctx.reply.bind(ctx);
    ctx.reply = async function(...args) {
        const sentMessage = await originalReply(...args);
        if (sentMessage.message_id) {
            ctx.session.botMessageIds.push(sentMessage.message_id);
            addMessageToRegistration(ctx, sentMessage.message_id);
        }
        return sentMessage;
    };

    await next();
}; 