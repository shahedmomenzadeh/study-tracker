using System;
using System.Collections.Generic;
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
                // 1. Remove Desktop Shortcuts from all known desktop directories
                string[] shortcutNames = new string[]
                {
                    "چنگیز - ردیاب مطالعه.lnk",
                    "چنگیز (Changiz).lnk",
                    "Changiz.lnk"
                };

                foreach (string desk in GetDesktopDirectories())
                {
                    foreach (string name in shortcutNames)
                    {
                        string lnk = Path.Combine(desk, name);
                        if (File.Exists(lnk))
                        {
                            try { File.Delete(lnk); } catch { }
                        }
                    }
                }

                // 2. Remove Start Menu Folder
                string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Changiz");
                if (Directory.Exists(startMenuDir))
                {
                    try { Directory.Delete(startMenuDir, true); } catch { }
                }

                // 3. Remove Registry Uninstall Entry
                try
                {
                    using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                    {
                        if (key != null) key.DeleteSubKeyTree("Changiz", false);
                    }
                }
                catch { }

                // 4. Schedule self deletion of installation directory
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

        private static string[] GetDesktopDirectories()
        {
            var list = new List<string>();
            string standard = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            if (!string.IsNullOrEmpty(standard) && Directory.Exists(standard))
            {
                list.Add(standard);
            }

            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"))
                {
                    if (key != null)
                    {
                        object val = key.GetValue("Desktop");
                        if (val != null)
                        {
                            string expanded = Environment.ExpandEnvironmentVariables(val.ToString());
                            if (Directory.Exists(expanded) && !list.Contains(expanded))
                            {
                                list.Add(expanded);
                            }
                        }
                    }
                }
            }
            catch { }

            return list.ToArray();
        }
    }
}
