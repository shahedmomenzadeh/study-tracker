using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ChangizInstaller
{
    [ComImport]
    [Guid("00021401-0000-0000-C000-000000000046")]
    internal class ShellLink
    {
    }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    internal interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszFile, int cchMaxPath, out IntPtr pfd, int fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
        void Resolve(IntPtr hwnd, int fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    public class SetupForm : Form
    {
        private TextBox txtInstallPath;
        private Button btnBrowse;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private CheckBox chkLaunchAfter;
        private ProgressBar progressBar;
        private Label lblStatus;
        private Button btnInstall;
        private Button btnCancel;

        public SetupForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "نصب چنگیز | Changiz Setup";
            this.ClientSize = new Size(580, 480);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.RightToLeft = RightToLeft.Yes;
            this.RightToLeftLayout = false;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            this.BackColor = Color.FromArgb(248, 247, 244);

            // Load Application Icon if embedded
            try
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("icon.ico"))
                {
                    if (s != null) this.Icon = new Icon(s);
                }
            }
            catch { }

            // 1. Top Header Banner
            Panel headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 85;
            headerPanel.BackColor = Color.FromArgb(255, 107, 53);
            headerPanel.Paint += (s, e) =>
            {
                e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                using (Font titleFont = new Font("Segoe UI", 14f, FontStyle.Bold))
                using (Font subFont = new Font("Segoe UI", 9.5f, FontStyle.Regular))
                using (SolidBrush brush = new SolidBrush(Color.White))
                {
                    e.Graphics.DrawString("نصب و راه‌اندازی چنگیز (Changiz)", titleFont, brush, new PointF(20, 16));
                    e.Graphics.DrawString("چنگیز با سیبیل کلفتش بالاسرته که درست رو بخونی", subFont, brush, new PointF(22, 50));
                }
            };
            this.Controls.Add(headerPanel);

            // 2. Bottom Action Panel
            Panel bottomPanel = new Panel();
            bottomPanel.Dock = DockStyle.Bottom;
            bottomPanel.Height = 55;
            bottomPanel.BackColor = Color.FromArgb(240, 238, 234);
            bottomPanel.Paint += (s, e) =>
            {
                using (Pen p = new Pen(Color.FromArgb(215, 212, 205)))
                {
                    e.Graphics.DrawLine(p, 0, 0, bottomPanel.Width, 0);
                }
            };

            btnInstall = new Button();
            btnInstall.Text = "نصب چنگیز";
            btnInstall.Size = new Size(115, 32);
            btnInstall.Location = new Point(25, 11);
            btnInstall.BackColor = Color.FromArgb(255, 107, 53);
            btnInstall.ForeColor = Color.White;
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnInstall.Cursor = Cursors.Hand;
            btnInstall.Click += StartInstallation;
            bottomPanel.Controls.Add(btnInstall);

            btnCancel = new Button();
            btnCancel.Text = "انصراف";
            btnCancel.Size = new Size(90, 32);
            btnCancel.Location = new Point(150, 11);
            btnCancel.BackColor = Color.White;
            btnCancel.FlatStyle = FlatStyle.Flat;
            btnCancel.FlatAppearance.BorderColor = Color.FromArgb(200, 198, 192);
            btnCancel.Cursor = Cursors.Hand;
            btnCancel.Click += (s, e) => this.Close();
            bottomPanel.Controls.Add(btnCancel);

            this.Controls.Add(bottomPanel);

            // 3. Main Setup Controls (Directly on form for perfect visibility)
            int curY = 98;

            Label lblIntro = new Label();
            lblIntro.Text = "برنامه چنگیز در مسیر زیر نصب خواهد شد. برای تغییر مسیر، روی «انتخاب پوشه...» کلیک کنید:";
            lblIntro.Location = new Point(25, curY);
            lblIntro.Size = new Size(530, 24);
            lblIntro.ForeColor = Color.FromArgb(60, 64, 75);
            this.Controls.Add(lblIntro);

            curY += 28;

            Label lblPath = new Label();
            lblPath.Text = "مسیر پوشه نصب برنامه:";
            lblPath.Location = new Point(25, curY);
            lblPath.Size = new Size(160, 20);
            lblPath.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            this.Controls.Add(lblPath);

            curY += 24;

            // Default install path in standard user application directory (no admin needed)
            string defaultPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs", "Changiz"
            );

            txtInstallPath = new TextBox();
            txtInstallPath.Text = defaultPath;
            txtInstallPath.Location = new Point(25, curY);
            txtInstallPath.Size = new Size(420, 26);
            txtInstallPath.RightToLeft = RightToLeft.No; // File paths flow LTR cleanly
            this.Controls.Add(txtInstallPath);

            btnBrowse = new Button();
            btnBrowse.Text = "انتخاب پوشه...";
            btnBrowse.Location = new Point(455, curY - 1);
            btnBrowse.Size = new Size(100, 28);
            btnBrowse.BackColor = Color.White;
            btnBrowse.FlatStyle = FlatStyle.Flat;
            btnBrowse.FlatAppearance.BorderColor = Color.FromArgb(200, 198, 192);
            btnBrowse.Cursor = Cursors.Hand;
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.Description = "مسیر نصب برنامه چنگیز را انتخاب کنید:";
                    if (Directory.Exists(txtInstallPath.Text))
                    {
                        fbd.SelectedPath = txtInstallPath.Text;
                    }
                    if (fbd.ShowDialog(this) == DialogResult.OK)
                    {
                        string selected = fbd.SelectedPath;
                        if (!selected.TrimEnd('\\').EndsWith("Changiz", StringComparison.OrdinalIgnoreCase))
                        {
                            selected = Path.Combine(selected, "Changiz");
                        }
                        txtInstallPath.Text = selected;
                    }
                }
            };
            this.Controls.Add(btnBrowse);

            curY += 38;

            // Shortcuts GroupBox
            GroupBox grpOptions = new GroupBox();
            grpOptions.Text = "تنظیمات میانبرها و اجرا";
            grpOptions.Location = new Point(25, curY);
            grpOptions.Size = new Size(530, 118);
            grpOptions.ForeColor = Color.FromArgb(40, 44, 52);

            chkDesktopShortcut = new CheckBox();
            chkDesktopShortcut.Text = "ایجاد میانبر روی دسکتاپ (Desktop Shortcut)";
            chkDesktopShortcut.Checked = true;
            chkDesktopShortcut.Location = new Point(15, 24);
            chkDesktopShortcut.Size = new Size(495, 24);
            chkDesktopShortcut.Cursor = Cursors.Hand;
            grpOptions.Controls.Add(chkDesktopShortcut);

            chkStartMenuShortcut = new CheckBox();
            chkStartMenuShortcut.Text = "ایجاد میانبر در منوی استارت (Start Menu)";
            chkStartMenuShortcut.Checked = true;
            chkStartMenuShortcut.Location = new Point(15, 52);
            chkStartMenuShortcut.Size = new Size(495, 24);
            chkStartMenuShortcut.Cursor = Cursors.Hand;
            grpOptions.Controls.Add(chkStartMenuShortcut);

            chkLaunchAfter = new CheckBox();
            chkLaunchAfter.Text = "اجرای خودکار چنگیز پس از اتمام فرآیند نصب";
            chkLaunchAfter.Checked = true;
            chkLaunchAfter.Location = new Point(15, 80);
            chkLaunchAfter.Size = new Size(495, 24);
            chkLaunchAfter.Cursor = Cursors.Hand;
            grpOptions.Controls.Add(chkLaunchAfter);

            this.Controls.Add(grpOptions);

            curY += 128;

            // Installation Progress Bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(25, curY);
            progressBar.Size = new Size(530, 16);
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            // Installation Status Label
            lblStatus = new Label();
            lblStatus.Text = "";
            lblStatus.Location = new Point(25, curY + 20);
            lblStatus.Size = new Size(530, 22);
            lblStatus.ForeColor = Color.FromArgb(85, 90, 100);
            lblStatus.Visible = false;
            this.Controls.Add(lblStatus);
        }

        private void StartInstallation(object sender, EventArgs e)
        {
            string targetDir = txtInstallPath.Text.Trim();
            if (string.IsNullOrEmpty(targetDir))
            {
                MessageBox.Show(
                    "لطفاً یک مسیر معتبر برای نصب برنامه مشخص کنید.",
                    "خطا در مسیر نصب",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                txtInstallPath.Focus();
                return;
            }

            try
            {
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "امکان ساخت پوشه در مسیر مشخص‌شده وجود ندارد:\n" + ex.Message + "\n\nلطفاً مسیر دیگری را انتخاب نمایید یا برنامه را با دسترسی مدیر (Run as administrator) اجرا کنید.",
                    "خطای دسترسی",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                txtInstallPath.Focus();
                return;
            }

            // Lock controls during install
            btnInstall.Enabled = false;
            btnCancel.Enabled = false;
            btnBrowse.Enabled = false;
            txtInstallPath.Enabled = false;
            chkDesktopShortcut.Enabled = false;
            chkStartMenuShortcut.Enabled = false;
            chkLaunchAfter.Enabled = false;

            progressBar.Visible = true;
            lblStatus.Visible = true;
            progressBar.Value = 5;
            lblStatus.Text = "درحال آماده‌سازی فایل‌ها...";

            Application.DoEvents();

            try
            {
                // 1. Extract embedded app_bundle.zip to temp file
                string tempZip = Path.Combine(Path.GetTempPath(), "changiz_bundle_" + Guid.NewGuid().ToString("N") + ".zip");
                using (Stream resStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app_bundle.zip"))
                {
                    if (resStream == null)
                    {
                        throw new Exception("بسته برنامه در فایل نصبی یافت نشد (app_bundle.zip missing).");
                    }

                    using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write, FileShare.None))
                    {
                        byte[] buffer = new byte[65536];
                        int bytesRead;
                        while ((bytesRead = resStream.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            fs.Write(buffer, 0, bytesRead);
                        }
                    }
                }

                progressBar.Value = 20;
                lblStatus.Text = "درحال استخراج فایل‌های چنگیز...";
                Application.DoEvents();

                // 2. Unpack zip directly in-process with overwrite support
                using (ZipArchive archive = ZipFile.OpenRead(tempZip))
                {
                    int totalEntries = archive.Entries.Count;
                    int extractedCount = 0;

                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        extractedCount++;
                        string destPath = Path.Combine(targetDir, entry.FullName);

                        if (string.IsNullOrEmpty(entry.Name))
                        {
                            // Entry is a directory
                            if (!Directory.Exists(destPath)) Directory.CreateDirectory(destPath);
                        }
                        else
                        {
                            string parentDir = Path.GetDirectoryName(destPath);
                            if (!string.IsNullOrEmpty(parentDir) && !Directory.Exists(parentDir))
                            {
                                Directory.CreateDirectory(parentDir);
                            }
                            entry.ExtractToFile(destPath, true);
                        }

                        if (totalEntries > 0)
                        {
                            int pct = 20 + (int)((float)extractedCount / totalEntries * 60);
                            progressBar.Value = Math.Min(80, Math.Max(20, pct));
                        }
                        if (extractedCount % 10 == 0 || extractedCount == totalEntries)
                        {
                            lblStatus.Text = string.Format("درحال استخراج فایل‌ها ({0}/{1})...", extractedCount, totalEntries);
                            Application.DoEvents();
                        }
                    }
                }

                try { File.Delete(tempZip); } catch { }

                progressBar.Value = 85;
                lblStatus.Text = "درحال ثبت و ایجاد میانبرها...";
                Application.DoEvents();

                string exePath = Path.Combine(targetDir, "Changiz.exe");
                string iconPath = Path.Combine(targetDir, "assets", "icon.ico");
                if (!File.Exists(iconPath)) iconPath = exePath;

                // 3. Create Desktop Shortcut if checked
                if (chkDesktopShortcut.Checked)
                {
                    lblStatus.Text = "درحال ایجاد میانبر روی دسکتاپ...";
                    Application.DoEvents();

                    string[] desktopDirs = GetDesktopDirectories();
                    foreach (string desk in desktopDirs)
                    {
                        string lnkPath = Path.Combine(desk, "چنگیز - ردیاب مطالعه.lnk");
                        CreateShortcutFile(lnkPath, exePath, targetDir, iconPath, "چنگیز با سیبیل کلفتش بالاسرته که درست رو بخونی");
                    }
                }

                // 4. Create Start Menu Shortcuts if checked
                if (chkStartMenuShortcut.Checked)
                {
                    lblStatus.Text = "درحال ایجاد میانبر در منوی استارت...";
                    Application.DoEvents();

                    string startMenuFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Changiz");
                    if (!Directory.Exists(startMenuFolder)) Directory.CreateDirectory(startMenuFolder);

                    string startLnk = Path.Combine(startMenuFolder, "چنگیز (Changiz).lnk");
                    CreateShortcutFile(startLnk, exePath, targetDir, iconPath, "چنگیز با سیبیل کلفتش بالاسرته که درست رو بخونی");

                    string uninstallExe = Path.Combine(targetDir, "Uninstall.exe");
                    if (File.Exists(uninstallExe))
                    {
                        string uninstLnk = Path.Combine(startMenuFolder, "حذف چنگیز.lnk");
                        CreateShortcutFile(uninstLnk, uninstallExe, targetDir, uninstallExe, "حذف نرم‌افزار چنگیز از سیستم");
                    }
                }

                // 5. Register in Windows Add/Remove Programs
                lblStatus.Text = "درحال ثبت در ویندوز...";
                Application.DoEvents();
                RegisterUninstall(targetDir, exePath, iconPath);

                progressBar.Value = 100;
                lblStatus.Text = "نصب چنگیز با موفقیت به پایان رسید!";
                Application.DoEvents();

                MessageBox.Show(
                    "برنامه چنگیز با موفقیت روی سیستم شما نصب شد!\n\nاکنون چنگیز با سیبیل کلفتش بالاسرته که درست رو بخونی!",
                    "نصب موفقیت‌آمیز",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );

                // 6. Launch if checked
                if (chkLaunchAfter.Checked && File.Exists(exePath))
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = exePath,
                            WorkingDirectory = targetDir,
                            UseShellExecute = true
                        });
                    }
                    catch { }
                }

                this.Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "خطا در حین فرآیند نصب:\n" + ex.Message,
                    "خطای نصب",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                btnInstall.Enabled = true;
                btnCancel.Enabled = true;
                btnBrowse.Enabled = true;
                txtInstallPath.Enabled = true;
                chkDesktopShortcut.Enabled = true;
                chkStartMenuShortcut.Enabled = true;
                chkLaunchAfter.Enabled = true;
                lblStatus.Text = "فرآیند نصب با خطا مواجه شد.";
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

        private static bool CreateShortcutFile(string shortcutPath, string targetPath, string workingDir, string iconLocation, string description)
        {
            try
            {
                string dir = Path.GetDirectoryName(shortcutPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                IShellLinkW link = (IShellLinkW)new ShellLink();
                link.SetPath(targetPath);
                if (!string.IsNullOrEmpty(workingDir)) link.SetWorkingDirectory(workingDir);
                if (!string.IsNullOrEmpty(description)) link.SetDescription(description);
                if (!string.IsNullOrEmpty(iconLocation) && File.Exists(iconLocation))
                {
                    link.SetIconLocation(iconLocation, 0);
                }

                IPersistFile file = (IPersistFile)link;
                file.Save(shortcutPath, true);
                return File.Exists(shortcutPath);
            }
            catch
            {
                // Fallback to WScript.Shell
                try
                {
                    Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                    if (shellType != null)
                    {
                        object shell = Activator.CreateInstance(shellType);
                        object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                        Type sType = shortcut.GetType();
                        sType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                        if (!string.IsNullOrEmpty(workingDir))
                            sType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
                        if (!string.IsNullOrEmpty(description))
                            sType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { description });
                        if (!string.IsNullOrEmpty(iconLocation) && File.Exists(iconLocation))
                            sType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { iconLocation });
                        sType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
                        return File.Exists(shortcutPath);
                    }
                }
                catch { }
                return false;
            }
        }

        private void RegisterUninstall(string installDir, string exePath, string iconPath)
        {
            try
            {
                using (RegistryKey parent = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Changiz"))
                {
                    if (parent != null)
                    {
                        parent.SetValue("DisplayName", "چنگیز | Changiz Study Tracker");
                        parent.SetValue("DisplayVersion", "1.1.1");
                        parent.SetValue("Publisher", "Changiz");
                        parent.SetValue("DisplayIcon", iconPath);
                        parent.SetValue("InstallLocation", installDir);
                        string uninstallExe = Path.Combine(installDir, "Uninstall.exe");
                        parent.SetValue("UninstallString", "\"" + uninstallExe + "\"");
                    }
                }
            }
            catch { }
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }
}
