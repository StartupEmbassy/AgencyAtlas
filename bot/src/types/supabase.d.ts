declare module '@supabase/supabase-js' {
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

    export interface Database {
        public: {
            Tables: {
                users: {
                    Row: User;
                    Insert: Omit<User, 'id' | 'created_at'>;
                    Update: Partial<Omit<User, 'id' | 'created_at'>>;
                };
                real_estates: {
                    Row: RealEstate;
                    Insert: Omit<RealEstate, 'id' | 'created_at'>;
                    Update: Partial<Omit<RealEstate, 'id' | 'created_at'>>;
                };
            };
        };
    }
} 