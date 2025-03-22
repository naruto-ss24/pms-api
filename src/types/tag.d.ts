// tag.d.ts
export interface Tag {
  name: string; // primary key
  color?: string; // optional hex color string (e.g. "#FFFFFF")
  brgy?: string; // optional barangay (string)
  is_global?: number; // optional flag (0 or 1)
  count?: number; // optional count value
}

export interface VoterTag {
  id: number; // auto_increment primary key
  voter_id?: number; // optional voter id
  tag?: string; // optional tag name (references Tag.name)
}
