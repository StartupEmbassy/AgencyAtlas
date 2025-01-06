"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageTrackerMiddleware = messageTrackerMiddleware;
const messageManager_1 = require("../services/messageManager");
// Middleware para rastrear automáticamente los IDs de mensajes
async function messageTrackerMiddleware(ctx, next) {
    try {
        // Rastrear mensaje del usuario si existe
        if (ctx.message?.message_id) {
            (0, messageManager_1.trackUserMessage)(ctx, ctx.message.message_id);
        }
        // Interceptar el método reply
        const originalReply = ctx.reply.bind(ctx);
        ctx.reply = async function (...args) {
            const sentMessage = await originalReply(...args);
            if (sentMessage.message_id) {
                (0, messageManager_1.trackBotMessage)(ctx, sentMessage.message_id);
            }
            return sentMessage;
        };
        // Interceptar api.sendMessage
        const originalSendMessage = ctx.api.sendMessage.bind(ctx.api);
        ctx.api.sendMessage = async function (...args) {
            const sentMessage = await originalSendMessage(...args);
            if (sentMessage.message_id) {
                (0, messageManager_1.trackBotMessage)(ctx, sentMessage.message_id);
            }
            return sentMessage;
        };
        // Interceptar api.sendPhoto
        const originalSendPhoto = ctx.api.sendPhoto.bind(ctx.api);
        ctx.api.sendPhoto = async function (...args) {
            const sentMessage = await originalSendPhoto(...args);
            if (sentMessage.message_id) {
                (0, messageManager_1.trackBotMessage)(ctx, sentMessage.message_id);
            }
            return sentMessage;
        };
        // Interceptar api.sendLocation
        const originalSendLocation = ctx.api.sendLocation.bind(ctx.api);
        ctx.api.sendLocation = async function (...args) {
            const sentMessage = await originalSendLocation(...args);
            if (sentMessage.message_id) {
                (0, messageManager_1.trackBotMessage)(ctx, sentMessage.message_id);
            }
            return sentMessage;
        };
        await next();
    }
    catch (error) {
        console.error("Error en messageTrackerMiddleware:", error);
        await next();
    }
}
