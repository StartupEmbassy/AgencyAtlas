import { MyContext } from "../types/session";
import { deleteMessages, deleteMessageAfterTimeout } from "../services/messageManager";
import { logState } from "../utils/helpers";

export async function handleCancel(ctx: MyContext) {
    try {
        logState(ctx, "❌ Antes de cancelar");
        await ctx.answerCallbackQuery();
        await deleteMessages(ctx, [...ctx.session.botMessageIds, ...ctx.session.userMessageIds]);
        
        ctx.session.registration.step = 'idle';
        ctx.session.registration.currentRegistration = undefined;
        
        logState(ctx, "✨ Después de cancelar");
        if (ctx.chat) {
            const message = await ctx.reply("Proceso cancelado. Puedes empezar de nuevo enviando una foto.");
            // Borrar el mensaje después de 5 segundos
            await deleteMessageAfterTimeout(ctx, ctx.chat.id, message.message_id, 5000);
        }
    } catch (error) {
        console.error("Error al procesar cancelación:", error);
        if (ctx.chat) {
            const errorMessage = await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
            // Borrar el mensaje de error después de 5 segundos
            await deleteMessageAfterTimeout(ctx, ctx.chat.id, errorMessage.message_id, 5000);
        }
    }
} 