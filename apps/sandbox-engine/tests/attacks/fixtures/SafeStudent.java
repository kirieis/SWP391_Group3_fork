import java.util.Scanner;

// Standard Valid Student Submission
public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        if (scanner.hasNextLine()) {
            String line = scanner.nextLine();
            System.out.println("Echo: " + line);
        } else {
            System.out.println("Hello AITA");
        }
        scanner.close();
    }
}
