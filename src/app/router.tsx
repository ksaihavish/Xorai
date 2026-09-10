import { createBrowserRouter, RouterProvider } from 'react-router-dom'

// Both routes are deliberately blank. Phase 1 owns the design system and the
// i18n scaffold, and buildbook amendment 1 forbids a hardcoded user-facing
// string from that phase onward — so a placeholder here would only be deleted.
function PatientRoute() {
  return <div data-route="patient" />
}

function CaregiverRoute() {
  return <div data-route="caregiver" />
}

const router = createBrowserRouter([
  { path: '/p', element: <PatientRoute /> },
  { path: '/', element: <CaregiverRoute /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
