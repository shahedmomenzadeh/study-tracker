using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ChangizUninstall
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            DialogResult res = MessageBox.Show(
                "آیا مطمئن هستید که می‌خواهید برنامه چنگیز (Changiz) را از سیستم خود حذف کنید؟",
                "حذف چنگیز",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (res != DialogResult.Yes) return;

            try
            {
                // Remove Desktop Shortcut
                string desktopShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "چنگیز - ردیاب مطالعه.lnk");
                if (File.Exists(desktopShortcut)) File.Delete(desktopShortcut);

                // Remove Start Menu Shortcut
                string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Changiz");
                if (Directory.Exists(startMenuDir)) Directory.Delete(startMenuDir, true);

                // Remove Registry Uninstall Entry
                try
                {
                    using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                    {
                        if (key != null) key.DeleteSubKeyTree("Changiz", false);
                    }
                }
                catch { }

                // Schedule self deletion
                string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = string.Format("/C timeout /t 2 /nobreak > NUL & rd /s /q \"{0}\"", appDir),
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true
                };
                Process.Start(psi);

                MessageBox.Show(
                    "برنامه چنگیز با موفقیت از سیستم شما حذف گردید.",
                    "حذف کامل",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            catch (Exception ex)
            {
                MessageBox.Show("خطا در حذف برنامه:\n" + ex.Message, "خطا", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
