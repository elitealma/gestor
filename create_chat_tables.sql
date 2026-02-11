CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    type TEXT NOT NULL CHECK (type IN ('task', 'team', 'direct')),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    area_id UUID REFERENCES public.areas(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.chat_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(chat_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chats: Super Admin All" ON public.chats FOR ALL 
USING (exists (select 1 from profiles where id = auth.uid() and role = 'super_admin'));

CREATE POLICY "Chats: Participants View" ON public.chats FOR SELECT
USING (exists (select 1 from chat_participants where chat_id = chats.id and profile_id = auth.uid()));

CREATE POLICY "Chats: Area Leaders Area View" ON public.chats FOR SELECT
USING (exists (select 1 from profiles where id = auth.uid() and role = 'area_leader' and area_id = chats.area_id));

CREATE POLICY "Participants: Super Admin All" ON public.chat_participants FOR ALL 
USING (exists (select 1 from profiles where id = auth.uid() and role = 'super_admin'));

CREATE POLICY "Participants: View Own" ON public.chat_participants FOR SELECT
USING (profile_id = auth.uid() OR exists (select 1 from profiles where id = auth.uid() and role = 'area_leader'));

CREATE POLICY "Messages: Super Admin All" ON public.messages FOR ALL 
USING (exists (select 1 from profiles where id = auth.uid() and role = 'super_admin'));

CREATE POLICY "Messages: View if Participant" ON public.messages FOR SELECT
USING (exists (select 1 from chat_participants where chat_id = messages.chat_id and profile_id = auth.uid()));

CREATE POLICY "Messages: Send if Participant" ON public.messages FOR INSERT
WITH CHECK (exists (select 1 from chat_participants where chat_id = messages.chat_id and profile_id = auth.uid()));
