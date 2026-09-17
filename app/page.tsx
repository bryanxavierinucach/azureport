import { redirect } from 'next/navigation';
import { isAuthenticated } from './auth';
import TaskBoard from './task-board';

export default async function Home() {
  if (!(await isAuthenticated())) redirect('/login');
  return <TaskBoard />;
}
