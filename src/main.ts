import './styles.css';
import { mountApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app 根节点缺失');
mountApp(root);

// 开发模式下暴露状态与批量执行器，便于自动化压测与调试
if (import.meta.env.DEV) {
  import('./store').then(({ store }) => {
    (globalThis as Record<string, unknown>).__store = store;
  });
}
