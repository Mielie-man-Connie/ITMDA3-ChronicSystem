export const dummyUser = {
    id: "user001",
    name: "John Doe",
    role: "patient",
};

export const dummyCalendarData = {
  patient: [
    {
      id: "1",
      title: "Dr. Smith",
      date: "Today",
      time: "10:00 AM",
    },
    {
      id: "2",
      title: "Dr. Williams",
      date: "Tomorrow",
      time: "14:30 PM",
    },
    {
      id: "3",
      title: "Dental Check-up",
      date: "Friday",
      time: "09:00 AM",
    },
  ],

  doctor: [
    {
      id: "1",
      title: "Patient Consultation",
      date: "Today",
      time: "10:00 AM",
    },
    {
      id: "2",
      title: "Patient Consultation",
      date: "Today",
      time: "11:30 AM",
    },
    {
      id: "3",
      title: "Follow-up",
      date: "Tomorrow",
      time: "14:00 PM",
    },
  ],
};

export const dummyPatients = [
  {
    id: "1",
    name: "John Smith",
  },
  {
    id: "2",
    name: "Sarah Williams",
  },
  {
    id: "3",
    name: "Michael Brown",
  },
];

export const dummyAppointments = [
  {
    id: "1",
    patient: "John Smith",
    time: "09:00 AM",
  },
  {
    id: "2",
    patient: "Sarah Williams",
    time: "10:30 AM",
  },
  {
    id: "3",
    patient: "Michael Brown",
    time: "13:00 PM",
  },
];