import { MyContext } from "../types/session";
import { deleteMessages, deleteMessageAfterTimeout } from "../services/messageManager";
import { logState, validateAndProcessQR, QRValidationResult } from "../utils/helpers";
import { getUserByTelegramId, uploadPhoto, createRealEstate, createRealEstateContactInfo, createListing } from "../services/supabase";
import { PhotoRegistration } from "../types/types";
import crypto from 'crypto';
import { User } from "../types/types";

export async function handleFinalConfirm(ctx: MyContext) {
    try {
        logState(ctx, "✅ Iniciando guardado final");
        
        if (!ctx.from || !ctx.session.registration.currentRegistration || !ctx.chat) {
            throw new Error('Datos incompletos');
        }

        // Obtener el usuario actual con reintentos
        let user: User | null = null;
        for (let i = 0; i < 3; i++) {
            try {
                user = await getUserByTelegramId(ctx.from.id.toString());
                if (user) break;
            } catch (error) {
                console.log(`Intento ${i + 1} fallido al obtener usuario:`, error);
                if (i < 2) await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, i)));
            }
        }

        if (!user) {
            throw new Error('Usuario no encontrado');
        }

        // TypeScript ahora sabe que user no puede ser null después de este punto
        const validatedUser: User = user;

        // Una vez validado el usuario, procedemos con el resto
        try {
            // Borrar mensajes anteriores
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

        // Encontrar la foto principal
        const mainPhoto = ctx.session.registration.currentRegistration.photos.find(p => p.is_main === true);
        if (!mainPhoto) {
            throw new Error('No se encontró la foto principal');
        }

        // Procesar y subir la foto principal con reintentos
        let mainPhotoUrl;
        for (let i = 0; i < 3; i++) {
            try {
                const mainFile = await ctx.api.getFile(mainPhoto.file_id);
                const mainPhotoUrlTelegram = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${mainFile.file_path}`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                
                const mainResponse = await fetch(mainPhotoUrlTelegram, { 
                    signal: controller.signal 
                });
                
                clearTimeout(timeoutId);
                
                const mainPhotoBuffer = Buffer.from(await mainResponse.arrayBuffer());
                const mainFileName = `${crypto.randomUUID()}.jpg`;
                mainPhotoUrl = await uploadPhoto(mainPhotoBuffer, mainFileName);
                
                if (mainPhotoUrl) break;
            } catch (error) {
                console.log(`Intento ${i + 1} fallido al procesar foto:`, error);
                if (i < 2) await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, i)));
            }
        }

        if (!mainPhotoUrl) {
            throw new Error('Error al subir la foto principal');
        }

        // Guardar la inmobiliaria en la base de datos
        const realEstate = await createRealEstate({
            user_id: validatedUser.id,
            name: ctx.session.registration.currentRegistration.name || '',
            photo_url: mainPhotoUrl,
            web_url: ctx.session.registration.currentRegistration.web_url || undefined,
            latitude: ctx.session.registration.currentRegistration.location?.latitude || 0,
            longitude: ctx.session.registration.currentRegistration.location?.longitude || 0,
            is_active: true,
            created_by: validatedUser.id,
            updated_by: validatedUser.id,
            validation_score: mainPhoto.analysis?.validation_score,
            validation_reasons: mainPhoto.analysis?.validation_reasons,
            condition_score: mainPhoto.analysis?.condition_score,
            image_quality: mainPhoto.analysis?.image_quality,
            objects_detected: mainPhoto.analysis?.objects_detected
        });

        if (!realEstate) throw new Error('Error al crear la inmobiliaria');

        // Guardar la información de contacto
        if (ctx.session.registration.currentRegistration.contact_info) {
            await createRealEstateContactInfo({
                real_estate_id: realEstate.id,
                phone_numbers: ctx.session.registration.currentRegistration.contact_info.phone_numbers,
                emails: ctx.session.registration.currentRegistration.contact_info.emails,
                business_hours: ctx.session.registration.currentRegistration.contact_info.business_hours
            });
        }

        // Crear un mapa de QRs únicos con su mejor foto y validación
        const qrInfoMap = new Map<string, { photo: PhotoRegistration; validation: QRValidationResult }>();
        
        // Recopilar todos los QRs únicos
        for (const photo of ctx.session.registration.currentRegistration.photos) {
            if (photo.analysis?.qr_data) {
                const validation = await validateAndProcessQR(photo.analysis.qr_data);
                if (validation.isValid) {
                    const existingInfo = qrInfoMap.get(photo.analysis.qr_data);
                    if (!existingInfo || 
                        (photo.analysis.validation_score || 0) > (existingInfo.photo.analysis?.validation_score || 0)) {
                        qrInfoMap.set(photo.analysis.qr_data, { photo, validation });
                    }
                }
            }
        }

        // Crear listings para cada QR único
        const listingCreationPromises = Array.from(qrInfoMap.entries()).map(async ([qrData, { photo, validation }]) => {
            try {
                console.log(`📝 Creando listing para QR: ${qrData}`);
                
                // Obtener y procesar la foto
                const listingFile = await ctx.api.getFile(photo.file_id);
                const listingPhotoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${listingFile.file_path}`;
                
                // Usar AbortController para el timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                
                const photoResponse = await fetch(listingPhotoUrl, {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                const listingPhotoBuffer = Buffer.from(await photoResponse.arrayBuffer());
                const listingFileName = `${crypto.randomUUID()}.jpg`;
                const uploadedListingPhotoUrl = await uploadPhoto(listingPhotoBuffer, listingFileName);
                
                if (!uploadedListingPhotoUrl) {
                    throw new Error('Error al subir foto de listing');
                }

                // Determinar la URL web para el listing
                let webUrl = validation.url;
                if (!webUrl && photo.analysis?.web_url) {
                    const textUrlValidation = await validateAndProcessQR(photo.analysis.web_url);
                    if (textUrlValidation.isValid && textUrlValidation.url) {
                        webUrl = textUrlValidation.url;
                    }
                }

                // Crear el listing
                const listingResponse = await createListing(
                    realEstate.id,
                    uploadedListingPhotoUrl,
                    qrData,
                    webUrl,
                    validatedUser.id
                );

                if (!listingResponse || listingResponse.error) {
                    throw new Error(`Error al crear listing: ${listingResponse?.error?.message || 'No se recibieron datos'}`);
                }

                console.log(`✅ Listing creado con éxito: ${listingResponse.data?.id}`);
                return listingResponse.data;
            } catch (error) {
                console.error(`❌ Error al crear listing para QR ${qrData}:`, error);
                throw error;
            }
        });

        // Esperar a que se creen todos los listings
        if (listingCreationPromises.length > 0) {
            console.log(`🔄 Creando ${listingCreationPromises.length} listings...`);
            try {
                const createdListings = await Promise.all(listingCreationPromises);
                console.log(`✅ ${createdListings.length} listings creados con éxito`);
            } catch (error) {
                console.error('❌ Error al crear algunos listings:', error);
                throw new Error('Error al crear los listings');
            }
        }

        // Limpiar el teclado y mostrar mensaje de éxito
        await ctx.reply(`✅ ¡Inmobiliaria "${ctx.session.registration.currentRegistration.name}" registrada con éxito!`, {
            reply_markup: { remove_keyboard: true }
        });

        // Limpiar la sesión
        ctx.session.registration.currentRegistration = undefined;
        ctx.session.registration.step = 'idle';

    } catch (error) {
        console.error("Error al procesar confirmación:", error);
        if (ctx.chat) {
            const errorMessage = await ctx.reply("❌ Error al guardar los datos. Por favor, intenta nuevamente.");
            await deleteMessageAfterTimeout(ctx, ctx.chat.id, errorMessage.message_id, 5000);
        }
    }
} 