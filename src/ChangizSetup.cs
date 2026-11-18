using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ChangizInstaller
{
    public class SetupForm : Form
    {
        private TextBox txtInstallPath;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private CheckBox chkLaunchAfter;
        private ProgressBar progressBar;
        private Button btnInstall;
        private Button btnCancel;
        private Label lblStatus;

        public SetupForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "نصب چنگیز | Changiz Setup";
            this.Size = new Size(580, 480);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.RightToLeft = RightToLeft.Yes;
            this.RightToLeftLayout = true;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            this.BackColor = Color.FromArgb(248, 247, 244);

            // Load Icon if available
            try
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("icon.ico"))
                {
                    if (s != null) this.Icon = new Icon(s);
                }
            }
            catch { }

            // Header Banner
            Panel headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 100;
            headerPanel.BackColor = Color.FromArgb(255, 107, 53); // Terracotta Orange
            headerPanel.Paint += (s, e) =>
            {
                using (Font titleFont = new Font("Segoe UI", 15f, FontStyle.Bold))
                using (Font subFont = new Font("Segoe UI", 10f, FontStyle.Bold))
                using (SolidBrush brush = new SolidBrush(Color.White))
                {
                    e.Graphics.DrawString("نصب و راه‌اندازی چنگیز (Changiz)", titleFont, brush, new PointF(20, 20));
                    e.Graphics.DrawString("چنگیز با سیبیل کلفتش بالاسرته که درست رو بخونی", subFont, brush, new PointF(22, 58));
                }
            };
            this.Controls.Add(headerPanel);

            // Main Content Container
            Panel contentPanel = new Panel();
            contentPanel.Dock = DockStyle.Fill;
            contentPanel.Padding = new Padding(25);
            this.Controls.Add(contentPanel);

            int curY = 115;

            // Description Label
            Label lblIntro = new Label();
            lblIntro.Text = "این برنامه چنگیز را با تمامی ابزارهای ردیابی مطالعه، پایش هوشمند وبکم، تایمر دوگانه، استریک‌ها و آمار هفتگی روی سیستم شما نصب می‌کند.";
            lblIntro.Location = new Point(25, curY);
            lblIntro.Size = new Size(515, 38);
            lblIntro.ForeColor = Color.FromArgb(60, 64, 75);
            this.Controls.Add(lblIntro);

            curY += 46;

            // Install Path Label
            Label lblPath = new Label();
            lblPath.Text = "مسیر نصب برنامه:";
            lblPath.Location = new Point(25, curY);
            lblPath.Size = new Size(150, 20);
            lblPath.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            this.Controls.Add(lblPath);

            curY += 24;

            // Path Textbox
            string defaultPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs", "Changiz"
            );
            txtInstallPath = new TextBox();
            txtInstallPath.Text = defaultPath;
            txtInstallPath.Location = new Point(115, curY);
            txtInstallPath.Size = new Size(425, 26);
            this.Controls.Add(txtInstallPath);

            // Browse Button
            Button btnBrowse = new Button();
            btnBrowse.Text = "انتخاب پوشه...";
            btnBrowse.Location = new Point(25, curY);
            btnBrowse.Size = new Size(85, 27);
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.Description = "مسیر نصب برنامه چنگیز را مشخص کنید:";
                    fbd.SelectedPath = txtInstallPath.Text;
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtInstallPath.Text = fbd.SelectedPath;
                    }
                }
            };
            this.Controls.Add(btnBrowse);

            curY += 38;

            // GroupBox for shortcuts
            GroupBox grpOptions = new GroupBox();
            grpOptions.Text = "تنظیمات میانبرها";
            grpOptions.Location = new Point(25, curY);
            grpOptions.Size = new Size(515, 100);

            chkDesktopShortcut = new CheckBox();
            chkDesktopShortcut.Text = "ایجاد میانبر روی دسکتاپ (Desktop Shortcut)";
            chkDesktopShortcut.Checked = true;
            chkDesktopShortcut.Location = new Point(20, 24);
            chkDesktopShortcut.Size = new Size(470, 22);
            grpOptions.Controls.Add(chkDesktopShortcut);

            chkStartMenuShortcut = new CheckBox();
            chkStartMenuShortcut.Text = "ایجاد میانبر در منوی استارت (Start Menu)";
            chkStartMenuShortcut.Checked = true;
            chkStartMenuShortcut.Location = new Point(20, 48);
            chkStartMenuShortcut.Size = new Size(470, 22);
            grpOptions.Controls.Add(chkStartMenuShortcut);

            chkLaunchAfter = new CheckBox();
            chkLaunchAfter.Text = "اجرای خودکار چنگیز پس از اتمام نصب";
            chkLaunchAfter.Checked = true;
            chkLaunchAfter.Location = new Point(20, 72);
            chkLaunchAfter.Size = new Size(470, 22);
            grpOptions.Controls.Add(chkLaunchAfter);

            this.Controls.Add(grpOptions);

            curY += 110;

            // Progress Bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(25, curY);
            progressBar.Size = new Size(515, 14);
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            // Status Label
            lblStatus = new Label();
            lblStatus.Text = "";
            lblStatus.Location = new Point(25, curY + 16);
            lblStatus.Size = new Size(515, 20);
            lblStatus.ForeColor = Color.FromArgb(100, 105, 115);
            lblStatus.Visible = false;
            this.Controls.Add(lblStatus);

            curY += 40;

            // Action Buttons
            Panel bottomPanel = new Panel();
            bottomPanel.Dock = DockStyle.Bottom;
            bottomPanel.Height = 55;
            bottomPanel.BackColor = Color.FromArgb(240, 238, 234);

            btnCancel = new Button();
            btnCancel.Text = "انصراف";
            btnCancel.Location = new Point(25, 12);
            btnCancel.Size = new Size(90, 32);
            btnCancel.Click += (s, e) => this.Close();
            bottomPanel.Controls.Add(btnCancel);

            btnInstall = new Button();
            btnInstall.Text = "نصب چنگیز";
            btnInstall.Location = new Point(125, 12);
            btnInstall.Size = new Size(110, 32);
            btnInstall.BackColor = Color.FromArgb(255, 107, 53);
            btnInstall.ForeColor = Color.White;
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnInstall.Click += StartInstallation;
            bottomPanel.Controls.Add(btnInstall);

            this.Controls.Add(bottomPanel);
        }

        private void StartInstallation(object sender, EventArgs e)
        {
            string targetDir = txtInstallPath.Text.Trim();
            if (string.IsNullOrEmpty(targetDir))
            {
                MessageBox.Show("لطفاً یک مسیر معتبر برای نصب انتخاب کنید.", "خطا", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            btnInstall.Enabled = false;
            btnCancel.Enabled = false;
            progressBar.Visible = true;
            lblStatus.Visible = true;
            progressBar.Value = 10;
            lblStatus.Text = "درحال آماده‌سازی فایل‌ها...";

            Application.DoEvents();

            try
            {
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                progressBar.Value = 30;
                lblStatus.Text = "درحال استخراج فایل‌های چنگیز...";

                // Extract embedded app_bundle.zip
                string tempZip = Path.Combine(Path.GetTempPath(), "changiz_bundle_" + Guid.NewGuid().ToString("N") + ".zip");
                using (Stream resStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app_bundle.zip"))
                {
                    if (resStream == null)
                    {
                        throw new Exception("فایل‌های برنامه در راه‌انداز یافت نشد (app_bundle.zip missing).");
                    }

                    using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write))
                    {
                        byte[] buffer = new byte[65536];
                        int bytesRead;
                        while ((bytesRead = resStream.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            fs.Write(buffer, 0, bytesRead);
                        }
                    }
                }

                progressBar.Value = 50;
                lblStatus.Text = "درحال باز کردن بسته‌های نرم‌افزار...";

                // Unzip into targetDir using PowerShell or ZipFile
                UnzipArchive(tempZip, targetDir);

                try { File.Delete(tempZip); } catch { }

                progressBar.Value = 75;
                lblStatus.Text = "درحال ساخت میانبرها و ثبت در سیستم...";

                string exePath = Path.Combine(targetDir, "Changiz.exe");
                string iconPath = Path.Combine(targetDir, "assets", "icon.ico");
                if (!File.Exists(iconPath)) iconPath = exePath;

                // Create Desktop Shortcut
                if (chkDesktopShortcut.Checked)
                {
                    string desktopPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "چنگیز - ردیاب مطالعه.lnk");
                    CreateShortcut(desktopPath, exePath, iconPath, "چنگیز با سیبیل کلفتش بالاسرته که درست رو بخونی");
                }

                // Create Start Menu Shortcut
                if (chkStartMenuShortcut.Checked)
                {
                    string startMenuFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Changiz");
                    if (!Directory.Exists(startMenuFolder)) Directory.CreateDirectory(startMenuFolder);
                    string startShortcut = Path.Combine(startMenuFolder, "چنگیز (Changiz).lnk");
                    CreateShortcut(startShortcut, exePath, iconPath, "چنگیز با سیبیل کلفتش بالاسرته که درست رو بخونی");

                    // Also add uninstall shortcut
                    string uninstallExe = Path.Combine(targetDir, "Uninstall.exe");
                    if (File.Exists(uninstallExe))
                    {
                        string uninstShortcut = Path.Combine(startMenuFolder, "حذف چنگیز.lnk");
                        CreateShortcut(uninstShortcut, uninstallExe, uninstallExe, "حذف نرم‌افزار چنگیز");
                    }
                }

                // Register in Windows Uninstall Registry
                RegisterUninstall(targetDir, exePath, iconPath);

                progressBar.Value = 100;
                lblStatus.Text = "نصب چنگیز با موفقیت به پایان رسید!";

                MessageBox.Show(
                    "برنامه چنگیز با موفقیت نصب شد!\nاکنون چنگیز با سیبیل کلفتش بالاسرته که درست رو بخونی!",
                    "نصب موفقیت‌آمیز",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );

                // Launch if checked
                if (chkLaunchAfter.Checked && File.Exists(exePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = exePath,
                        WorkingDirectory = targetDir,
                        UseShellExecute = true
                    });
                }

                this.Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show("خطا در حین فرآیند نصب:\n" + ex.Message, "خطای نصب", MessageBoxButtons.OK, MessageBoxIcon.Error);
                btnInstall.Enabled = true;
                btnCancel.Enabled = true;
                lblStatus.Text = "خطا در نصب.";
            }
        }

        private void UnzipArchive(string zipPath, string extractPath)
        {
            // Use Windows built-in PowerShell Expand-Archive (guaranteed available on Win7+)
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = string.Format("-NoProfile -ExecutionPolicy Bypass -Command \"Expand-Archive -LiteralPath '{0}' -DestinationPath '{1}' -Force\"", zipPath, extractPath),
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            using (Process p = Process.Start(psi))
            {
                p.WaitForExit();
                if (p.ExitCode != 0)
                {
                    throw new Exception("خطا در استخراج فایل‌های نرم‌افزار (کد خطا: " + p.ExitCode + ")");
                }
            }
        }

        private void CreateShortcut(string shortcutPath, string targetPath, string iconLocation, string description)
        {
            try
            {
                string script = string.Format(
                    "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{0}'); $s.TargetPath = '{1}'; $s.WorkingDirectory = '{2}'; $s.IconLocation = '{3}'; $s.Description = '{4}'; $s.Save()",
                    shortcutPath.Replace("'", "''"),
                    targetPath.Replace("'", "''"),
                    Path.GetDirectoryName(targetPath).Replace("'", "''"),
                    iconLocation.Replace("'", "''"),
                    description.Replace("'", "''")
                );

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"" + script + "\"",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit();
                }
            }
            catch { }
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
                        parent.SetValue("DisplayVersion", "1.1.0");
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

