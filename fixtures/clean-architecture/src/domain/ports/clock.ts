/** Source of the current time, so that due dates and overdue checks are testable. */
export interface Clock {
  now(): Date;
}
