import { MyContext } from "../types/session";
import { InlineKeyboard } from "grammy";
import { logState } from "../utils/helpers";
import { createNewRegistration } from "../utils/helpers";
import { deletePreviousMessages } from "../utils/helpers";

export async function handleConfirmName(ctx: MyContext) {
    try {
        logState(ctx, "✅ Confirmando nombre");
        await ctx.answerCallbackQuery();
        await deletePreviousMessages(ctx);
        
        if (!ctx.session.registration.currentRegistration) {
            ctx.session.registration.currentRegistration = createNewRegistration();
        }
        
        // Obtener el nombre del mensaje anterior
        if (!ctx.callbackQuery?.message?.text) {
            throw new Error('No se pudo obtener el mensaje anterior');
        }

        const nameMatch = ctx.callbackQuery.message.text.match(/\"([^\"]+)\"/);
        if (nameMatch && nameMatch[1]) {
            ctx.session.registration.currentRegistration.name = nameMatch[1];
            ctx.session.registration.step = 'waiting_location';
            logState(ctx, "👉 Nombre confirmado, esperando ubicación");
            
            const keyboard = new InlineKeyboard()
                .text("❌ Cancelar", "cancel");
            
            await ctx.reply("Por favor, envía la ubicación de la inmobiliaria.", { 
                reply_markup: keyboard 
            });
        } else {
            throw new Error('No se pudo obtener el nombre');
        }
    } catch (error) {
        console.error("Error al confirmar nombre:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
} 