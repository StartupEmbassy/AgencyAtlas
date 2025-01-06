"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMessages = deleteMessages;
exports.deleteMessageAfterTimeout = deleteMessageAfterTimeout;
exports.trackBotMessage = trackBotMessage;
exports.trackUserMessage = trackUserMessage;
const grammy_1 = require("grammy");
async function deleteMessages(ctx, messageIds) {
    if (ctx.chat && messageIds) {
        for (let i = messageIds.length - 1; i >= 0; i--) {
            const messageId = messageIds[i];
            if (ctx.session.botMessageIds?.includes(messageId) ||
                ctx.session.userMessageIds?.includes(messageId)) {
                try {
                    await ctx.api.deleteMessage(ctx.chat.id, messageId);
                }
                catch (error) {
                    if (error instanceof grammy_1.GrammyError &&
                        error.description === "Bad Request: message to delete not found") {
                        console.log(`Message ID ${messageId} was not found, skipping deletion.`);
                    }
                    else {
                        console.error(`Failed to delete message ID ${messageId}: ${error}`);
                    }
                }
                finally {
                    // Limpiar IDs de mensajes de la sesión
                    if (ctx.session.botMessageIds) {
                        ctx.session.botMessageIds = ctx.session.botMessageIds.filter((id) => id !== messageId);
                    }
                    if (ctx.session.userMessageIds) {
                        ctx.session.userMessageIds = ctx.session.userMessageIds.filter((id) => id !== messageId);
                    }
                }
            }
        }
    }
}
async function deleteMessageAfterTimeout(ctx, chatId, messageId, timeout) {
    setTimeout(async () => {
        try {
            await ctx.api.deleteMessage(chatId, messageId);
            // Actualizar la sesión para remover el ID del mensaje
            if (ctx.session.botMessageIds) {
                ctx.session.botMessageIds = ctx.session.botMessageIds.filter((id) => id !== messageId);
            }
        }
        catch (error) {
            console.error("Error deleting message:", error);
        }
    }, timeout);
}
function trackBotMessage(ctx, messageId) {
    if (!ctx.session.botMessageIds) {
        ctx.session.botMessageIds = [];
    }
    ctx.session.botMessageIds.push(messageId);
}
function trackUserMessage(ctx, messageId) {
    if (!ctx.session.userMessageIds) {
        ctx.session.userMessageIds = [];
    }
    ctx.session.userMessageIds.push(messageId);
}
