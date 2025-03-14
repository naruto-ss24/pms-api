export type Voter = {
  id: number; // bigint(20) unsigned
  pims22_id?: number | null; // int(11), nullable
  comelec_id?: string | null; // varchar(65), nullable
  cluster?: number | null; // int(11), nullable
  precinct?: string | null; // varchar(10), nullable
  seq_no?: number | null; // int(11), nullable
  voter_no: number; // int(10) unsigned, not nullable
  fullname: string; // varchar(105), not nullable
  address?: string | null; // text, nullable
  contactnumber?: string | null; // varchar(45), nullable
  bdate?: string | null; // varchar(45), nullable
  sex?: string | null; // varchar(6), nullable
  type?: number | null; // int(11), nullable
  vtype?: string | null; // varchar(50), nullable
  district_code: string; // varchar(45), not nullable
  city_code?: string | null; // varchar(45), nullable
  brgy_code?: string | null; // varchar(45), nullable
  purok_code?: string | null; // varchar(105), nullable
  colorcode?: string | null; // varchar(45), nullable
  sector?: string | null; // varchar(250), nullable
  status: number; // int(10) unsigned, not nullable
  remarks?: string | null; // text, nullable
  is_houseleader: boolean; // int(1), not nullable
  is_grpleader: boolean; // int(1), not nullable
  is_clusterleader: boolean; // int(1), not nullable
  is_coordinator: boolean; // int(1) unsigned, not nullable
  is_tagged: boolean; // int(1), not nullable
  is_enemy: boolean; // int(1), not nullable
  editedby?: number | null; // int(10) unsigned, nullable
  deceased: boolean; // tinyint(1), not nullable
  datedeceased?: string | null; // date, nullable
  group_id: number; // int(11), not nullable
  family_id: number; // int(11), not nullable
  img?: string | null; // varchar(255), nullable
  img_thumb?: string | null; // varchar(255), nullable
  idprint: boolean; // tinyint(1), not nullable
  created_at?: string | null; // datetime, nullable
  updated_at?: string | null; // timestamp, nullable
  is_deleted: boolean; // int(1), not nullable
  is_xls: boolean; // int(1), not nullable
  not_voter?: boolean | null; // tinyint(1), nullable
  location?: {
    coords: {
      latitude: number;
      longitude: number;
      altitude: number | null;
      accuracy: number | null;
      altitudeAccuracy: number | null;
      heading: number | null;
      speed: number | null;
    };
    timestamp: number;
    mocked?: boolean;
  } | null;
  images?: string[] | null;
  tags?: { tag: string; printedAt?: string | null }[] | null;
  has_been_data_gathered?: boolean | null;
  hash_id?: number | null;
};
