import { MyContext } from "../types/session";
import { getUserByTelegramId } from "../services/supabase";

export async function handleStart(ctx: MyContext) {
    try {
        const welcomeMessage = "¡Bienvenido al Bot de Gestión de Inmobiliarias! 📸\n\n" +
            "Para registrar una nueva inmobiliaria, simplemente envía una foto del local.\n" +
            "Te guiaré paso a paso en el proceso de registro.";
        
        await ctx.reply(welcomeMessage);

        // Verificar si el usuario ya existe
        const user = await getUserByTelegramId(
            ctx.from?.id.toString() || '', 
            ctx.from?.username
        );
        
        if (!user) {
            await ctx.reply("Para comenzar, necesitas registrarte. Tu solicitud será enviada a los administradores para aprobación.");
        } else if (user.status === 'pending') {
            await ctx.reply("Tu solicitud está pendiente de aprobación. Por favor, espera la confirmación de un administrador.");
        } else if (user.status === 'rejected') {
            await ctx.reply("Lo siento, tu acceso ha sido denegado. Contacta a un administrador para más información.");
        }
    } catch (error) {
        console.error("Error en el comando start:", error);
        await ctx.reply("Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.");
    }
} 