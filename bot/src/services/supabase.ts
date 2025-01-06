import { SupabaseClient, createClient } from '@supabase/supabase-js/dist/module';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../../.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Las credenciales de Supabase son requeridas');
}

// Crear el cliente de Supabase
export const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Tipos para las tablas
export interface User {
    id: string;
    telegram_id: string;
    username: string;
    role: 'admin' | 'user';
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
}

export interface RealEstate {
    id: string;
    user_id: string;
    name: string;
    photo_url: string;
    qr_info: string | null;
    latitude: number;
    longitude: number;
    created_at: string;
}

// Funciones de usuario
export async function createUser(telegramId: string, username: string): Promise<User | null> {
    try {
        const { data, error } = await supabase
            .from('users')
            .insert([
                {
                    telegram_id: telegramId,
                    username: username,
                    role: 'user',
                    status: 'pending'
                }
            ])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error creating user:', error);
        return null;
    }
}

export async function getUserByTelegramId(telegramId: string): Promise<User | null> {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error getting user:', error);
        return null;
    }
}

export async function updateUserStatus(telegramId: string, status: User['status']): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('users')
            .update({ status })
            .eq('telegram_id', telegramId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error updating user status:', error);
        return false;
    }
}

// Funciones de inmobiliarias
export async function createRealEstate(data: Omit<RealEstate, 'id' | 'created_at'>): Promise<RealEstate | null> {
    try {
        const { data: newRealEstate, error } = await supabase
            .from('real_estates')
            .insert([data])
            .select()
            .single();

        if (error) throw error;
        return newRealEstate;
    } catch (error) {
        console.error('Error creating real estate:', error);
        return null;
    }
}

export async function getRealEstatesByUserId(userId: string): Promise<RealEstate[]> {
    try {
        const { data, error } = await supabase
            .from('real_estates')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting real estates:', error);
        return [];
    }
}

// Función para obtener todos los administradores
export async function getAdmins(): Promise<User[]> {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'admin');

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting admins:', error);
        return [];
    }
} 