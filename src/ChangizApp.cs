using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace Changiz
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                // Locate the renderer index.html
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string htmlPath = Path.Combine(appDir, "src", "renderer", "index.html");

                if (!File.Exists(htmlPath))
                {
                    // Check current directory
                    string altPath = Path.Combine(Directory.GetCurrentDirectory(), "src", "renderer", "index.html");
                    if (File.Exists(altPath))
                    {
                        htmlPath = altPath;
                    }
                    else
                    {
                        MessageBox.Show(
                            "فایل رابط کاربری برنامه یافت نشد.\nمسیر مورد انتظار:\n" + htmlPath,
                            "خطای چنگیز",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error
                        );
                        return;
                    }
                }

                // Dedicated user data directory for isolated offline storage
                string userDataDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Changiz", "Profile"
                );
                Directory.CreateDirectory(userDataDir);

                string fileUrl = "file:///" + htmlPath.Replace('\\', '/');

                // Find modern Chromium browser (Edge or Chrome)
                string browserPath = FindChromiumBrowser();

                if (!string.IsNullOrEmpty(browserPath) && File.Exists(browserPath))
                {
                    string arguments = string.Format(
                        "--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1260,860 --app-id=ChangizApp --allow-file-access-from-files",
                        fileUrl, userDataDir
                    );

                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = browserPath,
                        Arguments = arguments,
                        UseShellExecute = true
                    };

                    Process.Start(psi);
                }
                else
                {
                    // Fallback to opening file directly in default system browser
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = htmlPath,
                        UseShellExecute = true
                    });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "خطا در اجرای برنامه چنگیز:\n" + ex.Message,
                    "خطای چنگیز",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static string FindChromiumBrowser()
        {
            string[] possiblePaths = new string[]
            {
                // Microsoft Edge
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe"),
                // Google Chrome fallback
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe")
            };

            foreach (string p in possiblePaths)
            {
                if (File.Exists(p)) return p;
            }
            return null;
        }
    }
}

