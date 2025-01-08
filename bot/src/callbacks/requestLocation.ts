import { MyContext } from "../types/session";
import { InlineKeyboard } from "grammy";

export async function handleRequestLocation(ctx: MyContext) {
    try {
        await ctx.answerCallbackQuery();

        // Actualizar el estado
        ctx.session.registration.step = 'waiting_location';

        // Solicitar ubicación con botón dedicado
        await ctx.reply("Por favor, envía la ubicación del local usando el botón 'Enviar ubicación' o comparte la ubicación manualmente.", {
            reply_markup: {
                keyboard: [
                    [{ text: "📍 Enviar ubicación", request_location: true }],
                    [{ text: "❌ Cancelar" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });

        // Mostrar el resumen anterior
        if (ctx.session.registration.summary) {
            await ctx.reply("Resumen de la información detectada:\n\n" + ctx.session.registration.summary);
        }

    } catch (error) {
        console.error("Error al solicitar ubicación:", error);
        await ctx.reply("Hubo un error al procesar la solicitud. Por favor, intenta nuevamente.");
    }
} 