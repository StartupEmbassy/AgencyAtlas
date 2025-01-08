import { MyContext } from "../types/session";
import { deleteMessages } from "../services/messageManager";
import { logState } from "../utils/helpers";

export async function handleConfirm(ctx: MyContext) {
    try {
        logState(ctx, "✅ Iniciando confirmación");
        
        if (!ctx.from || !ctx.session.registration.currentRegistration || !ctx.chat) {
            throw new Error('Datos incompletos');
        }

        // Borrar mensajes anteriores
        try {
            if (ctx.callbackQuery?.message?.message_id) {
                await deleteMessages(ctx, [
                    ...ctx.session.botMessageIds, 
                    ...ctx.session.userMessageIds,
                    ctx.callbackQuery.message.message_id
                ]);
            }
        } catch (error) {
            console.log("Error no crítico al borrar mensajes:", error);
        }

        await ctx.answerCallbackQuery().catch(error => {
            console.log("Error no crítico al responder callback:", error);
        });

        // Mostrar resumen inicial
        const summary = `Por favor, verifica que los datos iniciales sean correctos:\n\n` +
            `📸 Foto: Recibida\n` +
            `🏢 Nombre: ${ctx.session.registration.currentRegistration.name || 'No detectado'}\n` +
            `🌐 Web: ${ctx.session.registration.currentRegistration.web_url || 'No detectada'}\n` +
            `📱 QR: ${ctx.session.registration.currentRegistration.qr || 'No detectado'}\n` +
            `☎️ Teléfonos: ${ctx.session.registration.currentRegistration.contact_info?.phone_numbers?.join(', ') || 'No detectados'}\n` +
            `📧 Emails: ${ctx.session.registration.currentRegistration.contact_info?.emails?.join(', ') || 'No detectados'}\n` +
            `🕒 Horario: ${ctx.session.registration.currentRegistration.contact_info?.business_hours || 'No detectado'}\n\n` +
            `Si los datos son correctos, por favor comparte la ubicación de la inmobiliaria.`;

        // Mostrar mensaje de confirmación
        await ctx.reply(summary);

        // Solicitar ubicación
        await ctx.reply("Por favor, comparte la ubicación de la inmobiliaria:", {
            reply_markup: {
                keyboard: [
                    [{ text: "📍 Compartir ubicación", request_location: true }],
                    [{ text: "❌ Cancelar" }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });

        // Actualizar el estado
        ctx.session.registration.step = 'waiting_location';

    } catch (error) {
        console.error("Error al procesar confirmación:", error);
        await ctx.reply("❌ Error al procesar la confirmación. Por favor, intenta nuevamente.");
    }
}