import { MyContext } from "../types/session";
import { deleteMessages, deleteMessageAfterTimeout } from "../services/messageManager";
import { logState } from "../utils/helpers";
import { getUserByTelegramId, uploadPhoto, createRealEstate, createRealEstateContactInfo, createListing } from "../services/supabase";
import crypto from 'crypto';

export async function handleConfirm(ctx: MyContext) {
    try {
        logState(ctx, "✅ Iniciando confirmación final");
        
        // Borrar todos los mensajes inmediatamente antes de procesar
        if (ctx.chat && ctx.callbackQuery?.message?.message_id) {
            await deleteMessages(ctx, [
                ...ctx.session.botMessageIds, 
                ...ctx.session.userMessageIds,
                ctx.callbackQuery.message.message_id
            ]);
        }

        await ctx.answerCallbackQuery();
        
        if (!ctx.from || !ctx.session.registration.currentRegistration || !ctx.chat) {
            throw new Error('Datos incompletos');
        }

        // Obtener el usuario actual
        const user = await getUserByTelegramId(ctx.from.id.toString());
        if (!user) {
            throw new Error('Usuario no encontrado');
        }

        // Encontrar la foto principal
        // @ts-ignore
        const mainPhoto = ctx.session.registration.currentRegistration.photos.find(p => p.is_main === true);
        if (!mainPhoto) {
            throw new Error('No se encontró la foto principal');
        }

        // Procesar y subir la foto principal
        const mainFile = await ctx.api.getFile(mainPhoto.file_id);
        const mainPhotoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${mainFile.file_path}`;
        const mainResponse = await fetch(mainPhotoUrl);
        const mainPhotoBuffer = Buffer.from(await mainResponse.arrayBuffer());
        
        const mainFileName = `${crypto.randomUUID()}.jpg`;
        const uploadedMainPhotoUrl = await uploadPhoto(mainPhotoBuffer, mainFileName);
        
        if (!uploadedMainPhotoUrl) {
            throw new Error('Error al subir la foto principal');
        }

        // Guardar la inmobiliaria en la base de datos
        const realEstate = await createRealEstate({
            user_id: user.id,
            name: ctx.session.registration.currentRegistration.name || '',
            photo_url: uploadedMainPhotoUrl,
            qr_info: ctx.session.registration.currentRegistration.qr || undefined,
            web_url: ctx.session.registration.currentRegistration.web_url || undefined,
            latitude: ctx.session.registration.currentRegistration.location?.latitude || 0,
            longitude: ctx.session.registration.currentRegistration.location?.longitude || 0,
            is_active: true,
            created_by: user.id,
            updated_by: user.id,
            validation_score: mainPhoto.analysis?.validation_score,
            validation_reasons: mainPhoto.analysis?.validation_reasons,
            condition_score: mainPhoto.analysis?.condition_score,
            image_quality: mainPhoto.analysis?.image_quality,
            objects_detected: mainPhoto.analysis?.objects_detected
        });

        if (!realEstate) {
            throw new Error('Error al guardar la inmobiliaria');
        }

        // Guardar la información de contacto
        if (ctx.session.registration.currentRegistration.contact_info) {
            await createRealEstateContactInfo({
                real_estate_id: realEstate.id,
                phone_numbers: ctx.session.registration.currentRegistration.contact_info.phone_numbers,
                emails: ctx.session.registration.currentRegistration.contact_info.emails,
                business_hours: ctx.session.registration.currentRegistration.contact_info.business_hours
            });
        }

        // Procesar y guardar las fotos de listings
        // @ts-ignore
        const listingPhotos = ctx.session.registration.currentRegistration.photos.filter(p => p.is_main === false);
        for (const listingPhoto of listingPhotos) {
            try {
                const listingFile = await ctx.api.getFile(listingPhoto.file_id);
                const listingPhotoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${listingFile.file_path}`;
                const listingResponse = await fetch(listingPhotoUrl);
                const listingPhotoBuffer = Buffer.from(await listingResponse.arrayBuffer());
                
                const listingFileName = `${crypto.randomUUID()}.jpg`;
                const uploadedListingPhotoUrl = await uploadPhoto(listingPhotoBuffer, listingFileName);
                
                if (uploadedListingPhotoUrl) {
                    await createListing({
                        real_estate_id: realEstate.id,
                        photo_url: uploadedListingPhotoUrl,
                        qr_data: listingPhoto.analysis?.qr_data || undefined,
                        web_url: listingPhoto.analysis?.web_url || undefined,
                        created_by: user.id,
                        updated_by: user.id,
                        is_active: true
                    });
                }
            } catch (error) {
                console.error('Error al procesar foto de listing:', error);
                // Continuar con la siguiente foto aunque haya error
            }
        }

        // Limpiar la sesión
        ctx.session.registration.step = 'idle';
        ctx.session.registration.currentRegistration = undefined;
        logState(ctx, "✨ Registro completado y sesión limpiada");
        
        // Mostrar mensaje de éxito temporal
        const successMessage = await ctx.reply("✅ ¡Inmobiliaria registrada con éxito!");
        if (ctx.chat) {
            await deleteMessageAfterTimeout(ctx, ctx.chat.id, successMessage.message_id, 3000);
        }
    } catch (error) {
        console.error("Error al procesar confirmación:", error);
        if (ctx.chat) {
            const errorMessage = await ctx.reply("❌ Error al guardar los datos. Por favor, intenta nuevamente.");
            await deleteMessageAfterTimeout(ctx, ctx.chat.id, errorMessage.message_id, 5000);
        }
    }
} 