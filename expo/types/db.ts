export type UserRole = "doctor" | "patient" | "advisor" | "admin";

export interface DoctorProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  specialization: string | null;
  city: string | null;
  is_founding_doctor: boolean | null;
}

export interface PatientProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  city: string | null;
}

export type RelationStatus = "pending" | "active" | "archived";

export interface RelationWithPatient {
  id: string;
  status: RelationStatus;
  patient: Pick<PatientProfile, "id" | "first_name" | "last_name"> | null;
}

export interface RelationWithDoctor {
  id: string;
  status: RelationStatus;
  doctor: Pick<DoctorProfile, "id" | "first_name" | "last_name"> | null;
}

export interface TherapyCycle {
  id: string;
  doctor_id: string;
  patient_id: string;
  protocol_name: string | null;
  goal_type: string | null;
  goal_start: number | null;
  goal_target: number | null;
  goal_unit: string | null;
  goal_waist_cm: number | null;
  goal_hips_cm: number | null;
  goal_abdomen_cm: number | null;
  start_date: string | null;
  expected_end: string | null;
  status: "active" | "completed" | "archived";
}

export interface WeeklyCheckin {
  id: string;
  therapy_cycle_id: string;
  patient_id: string;
  week_number: number | null;
  checkin_date: string | null;
  weight_kg: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  abdomen_cm: number | null;
}

export interface WeeklyCheckinFull extends WeeklyCheckin {
  wellbeing: number | null;
  energy: number | null;
  appetite: number | null;
  food_noise: number | null;
  symptoms: string[] | null;
  symptoms_notes: string | null;
}

export interface DailyCheckin {
  id: string;
  therapy_cycle_id: string;
  patient_id: string;
  checkin_date: string | null;
  wellbeing: number | null;
  appetite: number | null;
  food_noise: number | null;
  energy: number | null;
  sleep: number | null;
  nausea: boolean | null;
  weakness: boolean | null;
  notes: string | null;
}

export type PhotoAngle = "front" | "side" | "back";

export interface ProgressPhoto {
  id: string;
  patient_id: string;
  therapy_cycle_id: string;
  weekly_checkin_id: string | null;
  file_url: string;
  angle: PhotoAngle;
  photo_date: string | null;
  created_at: string | null;
}
