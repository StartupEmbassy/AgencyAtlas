import { MyContext } from "../types/session";
import { Location } from "@grammyjs/types";
import { InlineKeyboard } from "grammy";

export async function handleLocation(ctx: MyContext) {
    try {
        // Verificar que tenemos todos los datos necesarios
        if (!ctx.message || !('location' in ctx.message) || !ctx.from || !ctx.session.registration.currentRegistration) {
            throw new Error('Datos de ubicación incompletos');
        }

        const location = ctx.message.location as Location;

        // Guardar la ubicación en el registro actual
        ctx.session.registration.currentRegistration.location = location;

        // Limpiar el teclado
        await ctx.reply("Ubicación recibida", {
            reply_markup: { remove_keyboard: true }
        });

        // Mostrar resumen final y pedir confirmación
        const summary = `Por favor, verifica que todos los datos sean correctos:\n\n` +
            `📸 Foto: Recibida\n` +
            `🏢 Nombre: ${ctx.session.registration.currentRegistration.name || 'No detectado'}\n` +
            `🌐 Web: ${ctx.session.registration.currentRegistration.web_url || 'No detectada'}\n` +
            `📱 QR: ${ctx.session.registration.currentRegistration.qr || 'No detectado'}\n` +
            `📍 Ubicación: ${location.latitude}, ${location.longitude}\n` +
            `☎️ Teléfonos: ${ctx.session.registration.currentRegistration.contact_info?.phone_numbers?.join(', ') || 'No detectados'}\n` +
            `📧 Emails: ${ctx.session.registration.currentRegistration.contact_info?.emails?.join(', ') || 'No detectados'}\n` +
            `🕒 Horario: ${ctx.session.registration.currentRegistration.contact_info?.business_hours || 'No detectado'}\n\n` +
            `¿Deseas guardar esta inmobiliaria?`;

        const keyboard = new InlineKeyboard()
            .text("✅ Confirmar", "final_confirm")
            .text("❌ Cancelar", "cancel");

        await ctx.reply(summary, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });

        // Actualizar el estado
        ctx.session.registration.step = 'waiting_final_confirm';

    } catch (error) {
        console.error("Error al procesar ubicación:", error);
        await ctx.reply("❌ Error al procesar la ubicación. Por favor, intenta nuevamente.");
    }
} 