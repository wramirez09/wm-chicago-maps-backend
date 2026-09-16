import { fetchJson } from '../lib/http.js';

const INFO = 'https://gbfs.divvybikes.com/gbfs/en/station_information.json';
const STATUS = 'https://gbfs.divvybikes.com/gbfs/en/station_status.json';

type Info = { data: { stations: { station_id: string; name: string; lon: number; lat: number }[] } };
type Status = {
  data: {
    stations: {
      station_id: string;
      num_bikes_available: number;
      num_ebikes_available?: number;
      num_docks_available: number;
      is_renting: number;
    }[];
  };
};

/** Divvy GBFS: two public feeds, no key. Merge on station_id. */
export async function divvyStations() {
  const [info, status] = await Promise.all([
    fetchJson<Info>(INFO, { service: 'divvy' }),
    fetchJson<Status>(STATUS, { service: 'divvy' }),
  ]);
  const byId = new Map(status.data.stations.map((s) => [s.station_id, s]));
  return info.data.stations.flatMap((s) => {
    const st = byId.get(s.station_id);
    if (!st) return [];
    return [{
      id: s.station_id,
      name: s.name,
      lng: s.lon,
      lat: s.lat,
      bikes: st.num_bikes_available,
      ebikes: st.num_ebikes_available ?? 0,
      docks: st.num_docks_available,
      renting: st.is_renting === 1,
    }];
  });
}
