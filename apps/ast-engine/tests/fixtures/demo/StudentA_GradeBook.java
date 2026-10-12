import java.util.ArrayList;
import java.util.List;

/**
 * Bài nộp của sinh viên A: quản lý điểm số của một lớp.
 */
public class GradeBook {

    private final List<String> names = new ArrayList<>();
    private final List<Double> scores = new ArrayList<>();

    public void addStudent(String name, double score) {
        if (score < 0 || score > 10) {
            throw new IllegalArgumentException("Score must be in [0, 10]");
        }
        names.add(name);
        scores.add(score);
    }

    public double average() {
        if (scores.isEmpty()) {
            return 0;
        }
        double sum = 0;
        for (int i = 0; i < scores.size(); i++) {
            sum += scores.get(i);
        }
        return sum / scores.size();
    }

    public String best() {
        int bestIndex = 0;
        for (int i = 1; i < scores.size(); i++) {
            if (scores.get(i) > scores.get(bestIndex)) {
                bestIndex = i;
            }
        }
        return names.get(bestIndex);
    }

    public int countPassed(double threshold) {
        int count = 0;
        for (double s : scores) {
            if (s >= threshold) {
                count++;
            }
        }
        return count;
    }

    public void printReport() {
        System.out.println("=== Grade report ===");
        for (int i = 0; i < names.size(); i++) {
            System.out.println(names.get(i) + ": " + scores.get(i));
        }
        System.out.println("Average: " + average());
        System.out.println("Passed: " + countPassed(5.0));
    }

    public static void main(String[] args) {
        GradeBook book = new GradeBook();
        book.addStudent("An", 8.5);
        book.addStudent("Binh", 4.0);
        book.addStudent("Chi", 9.0);
        book.printReport();
        System.out.println("Best: " + book.best());
    }
}