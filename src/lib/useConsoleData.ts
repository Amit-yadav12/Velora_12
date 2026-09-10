// Console data hook — ONE merged, real-time dataset for the entire business
// console. Server rows (Supabase via API) + demo tenant (localStorage) are
// de-duplicated by ref/id, so every page derives its numbers from the same
// source of truth. Subscriptions (Supabase realtime + local event bus) are
// registered once per page and always cleaned up.
import { useCallback, useEffect, useRef, useState } from 'react';
import supabase from './supabase';
import { apiGet } from './api';
import { listLocalBookings } from './offlineStore';
import { listDemoBusinesses, listDemoServices, listDemoStaff, listDemoCustomers } from './demoStore';
import { deriveCustomers, type CustomerRecord } from './metrics';
import {
  onBookingsChanged, onBusinessesChanged, onDemoReset, onNotifsChanged, onServicesChanged, onStaffChanged,
} from '../services/events';
import type { Business, BusinessService, BusinessStaff } from './product';
import type { ConsoleBooking, ExplicitCustomer } from './types';

export interface ConsoleData {
  bookings: ConsoleBooking[];
  businesses: Business[];
  services: BusinessService[];
  staff: BusinessStaff[];
  customers: CustomerRecord[];
  loading: boolean;
  reload: () => void;
}

export function useConsoleData(city?: string): ConsoleData {
  const [data, setData] = useState<Omit<ConsoleData, 'reload'>>({
    bookings: [], businesses: [], services: [], staff: [], customers: [], loading: true,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    // Fail-soft parallel loads: each source degrades independently.
    const [serverBookings, serverBiz, serverServices, serverStaff, serverCustomers] = await Promise.all([
      apiGet<ConsoleBooking[]>('/api/bookings').catch(() => null),
      city ? apiGet<Business[]>(`/api/businesses?city=${encodeURIComponent(city)}`).catch(() => null) : apiGet<Business[]>('/api/admin?resource=business').catch(() => null),
      apiGet<BusinessService[]>('/api/admin?resource=services').catch(() => null),
      apiGet<BusinessStaff[]>('/api/admin?resource=staff').catch(() => null),
      apiGet<ExplicitCustomer[]>('/api/admin?resource=customers').catch(() => null),
    ]);

    // Bookings: server + demo tenant, de-duplicated by ref (server wins).
    const serverB: ConsoleBooking[] = Array.isArray(serverBookings) ? serverBookings : [];
    const localB = listLocalBookings().map((b) => ({
      id: b.id, ref: b.ref,
      customer_name: b.customer_name || 'Guest', customer_email: b.customer_email || '',
      customer_phone: b.customer_phone || null,
      service_id: b.service_id ?? null, service_name: b.service_name,
      employee_name: b.staff_name || null, staff_id: b.staff_id ?? null,
      business_id: b.business_id, resource_name: b.business_name,
      start_time: b.start_time, end_time: b.end_time, status: b.status,
      price: b.price, location: b.location, created_at: b.created_at,
      qr_payload: b.qr_salt ? `local:${b.qr_salt}` : null,
      local: true,
    }));
    const refs = new Set(serverB.map((b) => b.ref));
    const bookings: ConsoleBooking[] = [...serverB, ...localB.filter((b) => !refs.has(b.ref))];

    // Businesses / services / staff: demo tenant merged with server rows.
    const demoBiz = listDemoBusinesses(city, true);
    const demoSvc = listDemoServices().map((s) => ({ ...s, demo: true }));
    const demoStaff = listDemoStaff().map((s) => ({ ...s, demo: true }));
    const serverBizRows: Business[] = Array.isArray(serverBiz) ? serverBiz : [];
    const serverSvcRows: BusinessService[] = Array.isArray(serverServices) ? serverServices : [];
    const serverStaffRows: BusinessStaff[] = Array.isArray(serverStaff) ? serverStaff : [];
    const demoBizIds = new Set(demoBiz.map((b) => String(b.id)));
    const demoSvcIds = new Set(demoSvc.map((s) => String(s.id)));
    const demoStaffIds = new Set(demoStaff.map((s) => String(s.id)));
    const businesses: Business[] = [...demoBiz, ...serverBizRows.filter((b) => !demoBizIds.has(String(b.id)))];
    const services: BusinessService[] = [...demoSvc, ...serverSvcRows.filter((s) => !demoSvcIds.has(String(s.id)))];
    const staff: BusinessStaff[] = [...demoStaff, ...serverStaffRows.filter((s) => !demoStaffIds.has(String(s.id)))];

    // Customers: derived from the SAME booking dataset + explicit profiles.
    const explicit = [
      ...(Array.isArray(serverCustomers) ? serverCustomers : []).map((c) => ({
        id: c.id, email: c.email, full_name: c.full_name, phone: c.phone, created_at: c.created_at,
      })),
      ...listDemoCustomers().map((c) => ({ id: c.id, email: c.email, full_name: c.name, phone: c.phone, created_at: c.created_at })),
    ];
    const customers = deriveCustomers(bookings, explicit);

    setData({ bookings, businesses, services, staff, customers, loading: false });
  }, [city]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // One Supabase channel + one local listener per event kind. Any change in
    // the shared dataset (either side) reloads — debounced so bursts coalesce.
    const debounced = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => load(), 120);
    };
    const ch = supabase
      .channel('console-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_services' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_staff' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, debounced)
      .subscribe();
    const offs = [
      onBookingsChanged(debounced),
      onNotifsChanged(debounced),
      onBusinessesChanged(debounced),
      onServicesChanged(debounced),
      onStaffChanged(debounced),
      onDemoReset(debounced),
    ];
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(ch);
      offs.forEach((off) => off());
    };
  }, [load]);

  return { ...data, reload: load };
}
