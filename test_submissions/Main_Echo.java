import java.util.Scanner;

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
