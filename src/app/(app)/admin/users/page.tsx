import type { Metadata } from "next";

import { UserManagement } from "@/app/(app)/admin/users/user-management";
import { requireAdmin } from "@/lib/auth/current-user";
import { listManagedEmployees } from "@/lib/users/employee-management";

export const metadata: Metadata = {
  title: "Employee accounts",
};

export default async function UserManagementPage() {
  await requireAdmin();
  const employees = await listManagedEmployees();

  return (
    <UserManagement
      employees={employees.map((employee) => ({
        ...employee,
        createdAt: employee.createdAt.toISOString(),
        role: employee.role,
        updatedAt: employee.updatedAt.toISOString(),
      }))}
    />
  );
}
