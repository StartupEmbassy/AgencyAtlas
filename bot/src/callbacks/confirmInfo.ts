import { MyContext } from "../types/session";
import { InlineKeyboard } from "grammy";

export async function handleConfirmInfo(ctx: MyContext) {
    try {
        await ctx.answerCallbackQuery();
        
        if (!ctx.session.registration.currentRegistration) {
            throw new Error('No hay registro activo');
        }

        // Cambiar al siguiente paso
        ctx.session.registration.step = 'waiting_location';

        const keyboard = new InlineKeyboard()
            .text("❌ Cancelar", "cancel");

        await ctx.reply("Perfecto. Por último, envía la ubicación de la inmobiliaria.", {
            reply_markup: keyboard
        });

    } catch (error) {
        console.error("Error al confirmar información:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
} 